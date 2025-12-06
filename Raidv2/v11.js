-- AuraKill.lua — standalone Up5-style kill aura + hitbox slider

----------------------------------------------------------------
-- Services / modules
----------------------------------------------------------------
local Players           = game:GetService("Players")
local RunService        = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local LocalPlayer       = Players.LocalPlayer

local EnemyManager   = require(ReplicatedStorage.Scripts.Client.Manager.EnemyManager)
local NotifyManager  = require(ReplicatedStorage.Scripts.Share.Manager.NotifyManager)
local AgentManager   = require(ReplicatedStorage.Scripts.Share.Manager.AgentManager)
local RaidsManager   = require(ReplicatedStorage.Scripts.Client.Manager.RaidsManager)
local RaidsConfig    = require(ReplicatedStorage.Scripts.Configs.Raids)
local MAPS           = require(ReplicatedStorage.Scripts.Configs.Map)

local Remotes         = ReplicatedStorage:WaitForChild("Remotes")
local AttackRemote    = Remotes:FindFirstChild("PlayerClickAttackSkill")
local R_CreateTeam    = Remotes:FindFirstChild("CreateRaidTeam")
local R_StartRaid     = Remotes:FindFirstChild("StartChallengeRaidMap")
local R_UseRaidItem   = Remotes:FindFirstChild("UseRaidItem")
local R_Setting       = Remotes:FindFirstChild("Setting")

----------------------------------------------------------------
-- Global state (shared with Up5.lua conventions)
----------------------------------------------------------------
_G.KillAuraEnabled = _G.KillAuraEnabled or false
_G.HitboxSize      = _G.HitboxSize or 2
_G.NPCFolder       = workspace:FindFirstChild("Enemys")

----------------------------------------------------------------
-- Helpers
----------------------------------------------------------------
local function getCurrentRaidLevel()
    if RaidsManager and RaidsManager.raidsMapInfo then
        return RaidsManager.raidsMapInfo.currentLevel
    end
    return nil
end

local attackThread

local function startAttackLoop()
    if attackThread then return end
    attackThread = task.spawn(function()
        while _G.KillAuraEnabled do
            if AttackRemote and EnemyManager and EnemyManager.enemyEntitys then
                local level = getCurrentRaidLevel()
                -- If we’re in a raid with levels, respect that; otherwise just attack everything
                for guid, enemy in pairs(EnemyManager.enemyEntitys) do
                    if enemy and enemy.data and enemy.data.hp and enemy.data.hp > 0 then
                        if not level or enemy.data.enemyLevel == level then
                            pcall(function()
                                AttackRemote:FireServer({ attackEnemyGUID = guid })
                            end)
                        end
                    end
                end
            end
            task.wait(0.1)
        end
        attackThread = nil
    end)
end

local function stopAttackLoop()
    _G.KillAuraEnabled = false
end

-- Hitbox expansion (same semantics as Up5.lua)
RunService.RenderStepped:Connect(function()
    local folder = _G.NPCFolder
    if not folder then return end

    for _, npc in ipairs(folder:GetChildren()) do
        if npc:IsA("Model") then
            local hrp = npc:FindFirstChild("HumanoidRootPart")
            local nameGui = hrp and hrp:FindFirstChild("EnemyNameGui")
            if hrp and nameGui then
                pcall(function()
                    if _G.KillAuraEnabled then
                        hrp.Size = Vector3.new(_G.HitboxSize,_G.HitboxSize,_G.HitboxSize)
                        hrp.CanCollide = false
                    else
                        hrp.Size = Vector3.new(2,2,1)
                        hrp.CanCollide = true
                    end
                end)
            end
        end
    end
end)

----------------------------------------------------------------
-- Chest helpers (teleport near EnchantChest on success)
----------------------------------------------------------------
local function getModelCenterCF(modelLike)
    if modelLike:IsA("Model") then
        local cf, size = modelLike:GetBoundingBox()
        return cf, size
    elseif modelLike:IsA("BasePart") then
        return modelLike.CFrame, modelLike.Size
    else
        local parts = {}
        for _, d in ipairs(modelLike:GetDescendants()) do
            if d:IsA("BasePart") then
                table.insert(parts, d)
            end
        end
        if #parts > 0 then
            local minVec, maxVec
            for i, p in ipairs(parts) do
                local c = p.Position
                if i == 1 then
                    minVec, maxVec = c, c
                else
                    minVec = Vector3.new(
                        math.min(minVec.X, c.X),
                        math.min(minVec.Y, c.Y),
                        math.min(minVec.Z, c.Z)
                    )
                    maxVec = Vector3.new(
                        math.max(maxVec.X, c.X),
                        math.max(maxVec.Y, c.Y),
                        math.max(maxVec.Z, c.Z)
                    )
                end
            end
            local center = (minVec + maxVec) / 2
            return CFrame.new(center), (maxVec - minVec)
        end
    end
    return nil, nil
end

local function placeAbove(cf, size, yOffset)
    yOffset = yOffset or 4
    local h = (size and size.Y or 4)
    return cf * CFrame.new(0, h/2 + yOffset, 0)
end

local function placeInFront(cf, distance)
    distance = distance or 6
    return cf * CFrame.new(0, 3, distance)
end

local function teleportToChestInside(chest)
    local char = LocalPlayer.Character or LocalPlayer.CharacterAdded:Wait()
    local root = char:WaitForChild("HumanoidRootPart")
    local hum  = char:FindFirstChildOfClass("Humanoid")
    if hum then
        hum.Sit = false
        pcall(function() hum.PlatformStand = false end)
    end
    pcall(function() char.PrimaryPart.Anchored = false end)

    local cf, size = getModelCenterCF(chest)
    if not cf then return false end

    local target = placeAbove(cf, size, 4)
    local success = false
    for i = 1, 5 do
        root.CFrame = target
        task.wait(0.1 + i*0.05)
        if (root.Position - target.Position).Magnitude < 6 then
            success = true
            break
        end
    end
    if not success then
        target = placeInFront(cf, 7)
        for i = 1, 5 do
            root.CFrame = target
            task.wait(0.1 + i*0.05)
            if (root.Position - target.Position).Magnitude < 8 then
                success = true
                break
            end
        end
    end
    if success then
        root.CFrame = root.CFrame + Vector3.new(0, 1.5, 0)
    end
    return success
end

----------------------------------------------------------------
-- Simple WindUI for toggling aura + hitbox
----------------------------------------------------------------
local WindUI = loadstring(game:HttpGet(
    "https://github.com/Footagesus/WindUI/releases/latest/download/main.lua"
))()

local parent = (gethui and gethui())
    or (pcall(function() return game:GetService("CoreGui") end) and game:GetService("CoreGui"))
    or LocalPlayer:WaitForChild("PlayerGui")
if WindUI.SetParent then WindUI:SetParent(parent) end

local Window = WindUI:CreateWindow({
    Title        = "AuraKill",
    Size         = UDim2.fromOffset(320, 180),
    Transparent  = true,
    Resizable    = true,
    SideBarWidth = 140,
})
Window:SetToggleKey(Enum.KeyCode.RightShift)
Window:Open()

local tabAura   = Window:Tab({ Title="Aura",      Icon="lucide:sparkles" })
local tabCR     = Window:Tab({ Title="Challenge", Icon="lucide:sword" })
local tabPrio   = Window:Tab({ Title="Priority",  Icon="lucide:target" })

local sec     = tabAura:Section({ Title="Kill Aura", Opened=true })

sec:Toggle({
    Title    = "Kill Aura",
    Default  = _G.KillAuraEnabled,
    Callback = function(on)
        _G.KillAuraEnabled = on and true or false
        if on then startAttackLoop() else stopAttackLoop() end
        WindUI:Notify({
            Title   = "Kill Aura",
            Content = on and "Enabled" or "Disabled",
            Duration= 2
        })
    end,
})

sec:Slider({
    Title="Hitbox Size",
    Step = 1,
    Value = { Min=2, Max=2000, Default=_G.HitboxSize or 2 },
    Callback=function(v)
        _G.HitboxSize = v
        WindUI:Notify({
            Title   = "Hitbox Size",
            Content = "Set to "..v,
            Duration= 1.5
        })
    end,
})

tabAura:Paragraph({
    Title = "Info",
    Desc  = "Up5-style kill aura: attacks EnemyManager.enemyEntitys and inflates hitboxes under workspace.Enemys while enabled. Challenge raids can auto-toggle it while in-raid.",
})

Window:OnDestroy(function()
    stopAttackLoop()
end)

----------------------------------------------------------------
-- Challenge Raid Hunter (Up5 flow + autorune/autodraw-style retries)
----------------------------------------------------------------

----------------------------------------------------------------
-- Challenge raid config mapping (Worlds × Grades)
----------------------------------------------------------------
local GRADE_INDEX = { E=1, D=2, C=3, B=4, A=5, S=6, SS=7, G=8, N=9, M=10 }
local GRADE_ORDER = { "E","D","C","B","A","S","SS","G","N","M" }

local WORLD_LIST, WORLD_NAME = {}, {}

do
    -- Pretty world names from MAPS, e.g. "1,Shadow Gate City"
    if type(MAPS) == "table" then
        for _, m in ipairs(MAPS) do
            local raw = m.MapName or m["MapName"]
            if type(raw) == "string" then
                local n, rest = raw:match("^(%d+)%s*,%s*(.+)$")
                if n and rest then
                    WORLD_NAME[tonumber(n)] = rest
                end
            end
        end
    end

    -- Worlds seen in Raids config (id >= 930001, same pattern as Up5/RaidHunter)
    local seen = {}
    if type(RaidsConfig) == "table" then
        for _, r in ipairs(RaidsConfig) do
            local id = tonumber(r.Id or r["Id"])
            if id and id >= 930001 then
                local delta = id - 930000
                local w     = math.floor(delta/10) + 1
                local gi    = delta % 10
                if w >= 1 and gi >= 1 and gi <= 10 and not seen[w] then
                    seen[w] = true
                    table.insert(WORLD_LIST, w)
                end
            end
        end
    end
    table.sort(WORLD_LIST)
end

local function raidIdFromWorldGrade(world, gradeLetter)
    local gi = GRADE_INDEX[gradeLetter]
    if not gi then return nil end
    return 930000 + (world - 1) * 10 + gi
end

----------------------------------------------------------------
-- Challenge raid state
----------------------------------------------------------------
local cr_useRuneEnabled     = false
local cr_selectedRuneItemId = nil
local cr_autoDrawEnabled    = false
local cr_autoAuraEnabled    = false
local cr_running            = false

local cr_lastJoinTick     = 0
local cr_inCycle          = false
local cr_lastRaidId       = nil
local cr_lastStartTime    = {}   -- [raidId] = os.clock()
local cr_openRaidIds      = {}   -- [raidId] = true while announced
local cr_priorityRaidIds  = {}   -- optional: ordered list of preferred raidIds

local cr_selectedWorlds   = {}
local cr_selectedGrades   = {}

local function cr_now() return os.clock() end

-- Wrapper so the announcement handler can call a priority-aware picker
local function cr_pickPriorityRaid()
    -- Fallback to the existing picker if priority list is empty
    if not (cr_priorityRaidIds and #cr_priorityRaidIds > 0) then
        return cr_pickLowestWantedOpen()
    end

    local wanted = cr_buildSelectedRaidIdSet()

    -- Prefer any configured priority raidIds (in order) when open and within the selected Worlds×Grades.
    for _, pid in ipairs(cr_priorityRaidIds) do
        if wanted[pid] and cr_openRaidIds[pid] then
            return pid
        end
    end

    -- Otherwise use the original lowest-id picker
    return cr_pickLowestWantedOpen()
end

----------------------------------------------------------------
-- Autodraw / autosell for challenge raids
----------------------------------------------------------------
local function cr_fireSettingAutoDraw(flag)
    if not cr_autoDrawEnabled then return end
    local payload
    if flag then
        payload = { { key = "autoDraw", value = true } }
    else
        payload = { { key = "autoSell", value = true } }
    end
    if R_Setting then
        pcall(function()
            R_Setting:FireServer(unpack(payload))
        end)
    end
end

----------------------------------------------------------------
-- Rune usage for challenge raids
----------------------------------------------------------------
local function cr_useSelectedRune()
    if not cr_useRuneEnabled or not cr_selectedRuneItemId then return end
    if R_UseRaidItem then
        pcall(function()
            R_UseRaidItem:FireServer(cr_selectedRuneItemId)
        end)
    end
end

----------------------------------------------------------------
-- Start a single challenge raid (Up5/RaidHunter style)
----------------------------------------------------------------
local function cr_createAndStartRaid(raidId)
    if not raidId then return end

    if R_CreateTeam then
        pcall(function()
            R_CreateTeam:InvokeServer(raidId)
        end)
    end

    task.wait(0.4) -- let team register
    cr_useSelectedRune()

    if R_StartRaid then
        pcall(function()
            R_StartRaid:FireServer()
            cr_lastStartTime[raidId] = os.clock()
            cr_fireSettingAutoDraw(true)
            if cr_autoAuraEnabled then
                _G.KillAuraEnabled = true
                startAttackLoop()
            end
        end)
    end
end

----------------------------------------------------------------
-- Retry loop: 25s from start; repeat until raid closes
----------------------------------------------------------------
local function cr_scheduleRetryLoop(raidId)
    task.spawn(function()
        while cr_running do
            if not cr_openRaidIds[raidId] then
                cr_inCycle    = false
                cr_lastRaidId = nil
                return
            end

            local startedAt = cr_lastStartTime[raidId] or os.clock()
            local elapsed   = os.clock() - startedAt
            local waitSecs  = (elapsed >= 30) and 1 or (30 - elapsed)

            task.wait(waitSecs)
            if not cr_running or not cr_openRaidIds[raidId] then
                cr_inCycle    = false
                cr_lastRaidId = nil
                return
            end

            cr_inCycle   = true
            cr_lastRaidId = raidId
            cr_createAndStartRaid(raidId)

            -- 10s watchdog to actually enter a raid
            local deadline = os.clock() + 10
            while os.clock() < deadline do
                if RaidsManager and RaidsManager.raidsMapInfo ~= nil then
                    return
                end
                RunService.Heartbeat:Wait()
            end

            cr_lastStartTime[raidId] = os.clock()
        end

        cr_inCycle    = false
        cr_lastRaidId = nil
    end)
end

----------------------------------------------------------------
-- Build selected raid set and pick lowest open
----------------------------------------------------------------
local function cr_buildSelectedRaidIdSet()
    local set = {}
    local grades = (#cr_selectedGrades == 0) and GRADE_ORDER or cr_selectedGrades
    for _, w in ipairs(cr_selectedWorlds) do
        for _, g in ipairs(grades) do
            local id = raidIdFromWorldGrade(w, g)
            if id then set[id] = true end
        end
    end
    return set
end

local function cr_pickLowestWantedOpen()
    local wanted = cr_buildSelectedRaidIdSet()

    -- If a priority raidId is set, open, and within the selected Worlds×Grades, always pick it first
    if cr_priorityRaidId and wanted[cr_priorityRaidId] and cr_openRaidIds[cr_priorityRaidId] then
        return cr_priorityRaidId
    end

    local lowest
    for rid, _ in pairs(cr_openRaidIds) do
        if wanted[rid] then
            if not lowest or rid < lowest then
                lowest = rid
            end
        end
    end
    return lowest
end

----------------------------------------------------------------
-- Listen for raid announcements (AddRaidEnters)
----------------------------------------------------------------
NotifyManager.RegisterClientEvent(
    NotifyManager.EventData.UpdateRaidInfo,
    function(payload)
        if not payload or not payload.action then return end

        if payload.action == "AddRaidEnters" and payload.raidInfos then
            for _, info in pairs(payload.raidInfos) do
                if info.raidId then
                    cr_openRaidIds[info.raidId] = true
                end
            end
        elseif payload.action == "RemoveRaidEnters" and payload.raidInfos then
            for _, info in pairs(payload.raidInfos) do
                if info.raidId then
                    cr_openRaidIds[info.raidId] = nil
                end
            end
        end

        if not cr_running then return end
        if payload.action ~= "AddRaidEnters" or not payload.raidInfos then return end
        if #cr_selectedWorlds == 0 then return end
        if cr_inCycle then return end

        local target = cr_pickPriorityRaid()
        if not target then return end

        local t = cr_now()
        if t - cr_lastJoinTick < 5 then return end
        cr_lastJoinTick = t
        cr_inCycle      = true
        cr_lastRaidId   = target
        cr_createAndStartRaid(target)
    end
)

----------------------------------------------------------------
-- Challenge raid success → retry loop
----------------------------------------------------------------
NotifyManager.RegisterClientEvent(NotifyManager.EventData.ChallengeRaidsSuccess, function(_payload)
    if not cr_running then return end
    if not cr_lastRaidId then return end
    cr_fireSettingAutoDraw(false)
    if cr_autoAuraEnabled then
        _G.KillAuraEnabled = false
    end

    -- Try to find and teleport to EnchantChest, then wait until it is gone before quitting
    task.spawn(function()
        local chest
        local t0 = os.clock()
        while os.clock() - t0 < 5 do
            chest = workspace:FindFirstChild("EnchantChest")
            if chest then break end
            task.wait(0.1)
        end
        if chest then
            teleportToChestInside(chest)
        end

        -- Wait until chest is collected/destroyed, with a safety cap
        local t1 = os.clock()
        while os.clock() - t1 < 10 do
            if not workspace:FindFirstChild("EnchantChest") then
                break
            end
            task.wait(0.2)
        end

        -- Leave current raid back to lobby/host before scheduling retry
        pcall(function()
            if RaidsManager and RaidsManager.QuitRaidMap then
                RaidsManager.QuitRaidMap()
            end
        end)
    end)

    -- Mark as in-cycle; cooldown measured from raid start (cr_lastStartTime)
    cr_inCycle = true
    cr_scheduleRetryLoop(cr_lastRaidId)
end)

-- Normal raid success (personal chest) → reuse same retry flow
AgentManager.RegisterEvent(AgentManager.EventNames.GainRaidsSuccessChest, function(_data)
    if not cr_running then return end
    if not cr_lastRaidId then return end
    cr_fireSettingAutoDraw(false)
    if cr_autoAuraEnabled then
        _G.KillAuraEnabled = false
    end

    task.spawn(function()
        local chest
        local t0 = os.clock()
        while os.clock() - t0 < 5 do
            chest = workspace:FindFirstChild("EnchantChest")
            if chest then break end
            task.wait(0.1)
        end
        if chest then
            teleportToChestInside(chest)
        end

        -- Wait until chest is collected/destroyed, with a safety cap
        local t1 = os.clock()
        while os.clock() - t1 < 10 do
            if not workspace:FindFirstChild("EnchantChest") then
                break
            end
            task.wait(0.2)
        end

        pcall(function()
            if RaidsManager and RaidsManager.QuitRaidMap then
                RaidsManager.QuitRaidMap()
            end
        end)

        cr_inCycle = true
        cr_scheduleRetryLoop(cr_lastRaidId)
    end)
end)

----------------------------------------------------------------
-- Challenge Raid tab UI
----------------------------------------------------------------
do
    local csec = tabCR:Section({ Title = "Challenge Raid", Opened = true })

    -- Worlds dropdown
    local worldLabels = {}
    for _, w in ipairs(WORLD_LIST) do
        local label = ("World %d%s"):format(
            w,
            WORLD_NAME[w] and (" — "..WORLD_NAME[w]) or ""
        )
        table.insert(worldLabels, label)
    end

    csec:Dropdown({
        Title     = "Worlds",
        Desc      = "Select challenge raid worlds (multi)",
        Values    = worldLabels,
        Value     = {},
        Multi     = true,
        AllowNone = false,
        Callback  = function(v)
            local vals   = (type(v)=="table") and v or {v}
            local chosen = {}
            for _, txt in ipairs(vals) do
                local n = tonumber(tostring(txt):match("World%s+(%d+)"))
                if n then table.insert(chosen, n) end
            end
            table.sort(chosen)
            cr_selectedWorlds = chosen
        end,
    })

    -- Grades dropdown
    local GRADE_OPTIONS = { "All","E","D","C","B","A","S","SS","G","N","M" }

    csec:Dropdown({
        Title     = "Grades",
        Desc      = "Challenge raid grades (multi; All = any)",
        Values    = GRADE_OPTIONS,
        Value     = { "All" },
        Multi     = true,
        AllowNone = false,
        Callback  = function(v)
            local vals   = (type(v)=="table") and v or {v}
            local useAll = false
            local list   = {}

            for _, s in ipairs(vals) do
                if tostring(s) == "All" then
                    useAll = true
                    break
                end
                if GRADE_INDEX[s] then
                    table.insert(list, s)
                end
            end

            if useAll or #list == 0 then
                cr_selectedGrades = {}
            else
                cr_selectedGrades = list
            end
        end,
    })

    -- Rune toggle + dropdown (uses same Item config as RaidHunter logic did)
    local runeValues = {}
    do
        local tmp = {}
        for _, it in ipairs(require(ReplicatedStorage.Scripts.Configs.Item) or {}) do
            local id   = it.Id or it["Id"]
            local name = it.Name or it["Name"]
            if id and name and tostring(name):find("Rune") then
                table.insert(tmp, { id = id, name = tostring(name) })
            end
        end
        table.sort(tmp, function(a,b) return a.id < b.id end)
        for _, r in ipairs(tmp) do
            table.insert(runeValues, ("%s (%d)"):format(r.name, r.id))
        end
    end

    csec:Toggle({
        Title    = "Use Rune",
        Desc     = "Use raid rune when raid starts",
        Default  = cr_useRuneEnabled,
        Callback = function(on)
            cr_useRuneEnabled = on and true or false
        end,
    })

    csec:Dropdown({
        Title     = "Rune",
        Desc      = "Rune item to use",
        Values    = (#runeValues > 0) and runeValues or { "None" },
        Value     = (#runeValues > 0) and runeValues[1] or "None",
        Multi     = false,
        AllowNone = true,
        Callback  = function(v)
            local txt = (type(v)=="table") and v[1] or v
            if not txt or txt == "None" then
                cr_selectedRuneItemId = nil
                return
            end
            local id = tonumber(txt:match("%((%d+)%)"))
            cr_selectedRuneItemId = id
        end,
    })

    -- Autodraw toggle
    csec:Toggle({
        Title    = "Autodraw / Arise",
        Desc     = "Toggle autoDraw inside challenge raids",
        Default  = cr_autoDrawEnabled,
        Callback = function(on)
            cr_autoDrawEnabled = on and true or false
        end,
    })

    -- Auto Kill Aura toggle (challenge raids)
    csec:Toggle({
        Title    = "Auto Kill Aura",
        Desc     = "Auto-enable Up5 kill aura when challenge raid starts, disable on success/leave",
        Default  = cr_autoAuraEnabled,
        Callback = function(on)
            cr_autoAuraEnabled = on and true or false
        end,
    })

    -- Priority raids dropdown (always prefer these raids first when open & selected)
    local priorityRaidValues = {}
    do
        if type(RaidsConfig) == "table" then
            local tmp = {}
            for _, r in ipairs(RaidsConfig) do
                local id = tonumber(r.Id or r["Id"])
                if id and id >= 930001 then
                    local name = r.NameText or r["NameText"] or r.Name or r["Name"] or ("Raid "..tostring(id))
                    table.insert(tmp, { id = id, label = tostring(name) })
                end
            end
            table.sort(tmp, function(a,b) return a.id < b.id end)
            for _, entry in ipairs(tmp) do
                table.insert(priorityRaidValues, ("%s (%d)"):format(entry.label, entry.id))
            end
        end
    end

    csec:Dropdown({
        Title     = "Priority Raids",
        Desc      = "Always prefer these raids first (multi)",
        Values    = (#priorityRaidValues > 0) and priorityRaidValues or { "None" },
        Value     = {},
        Multi     = true,
        AllowNone = true,
        Callback  = function(v)
            local ids  = {}
            local vals = (type(v) == "table") and v or { v }
            for _, txt in ipairs(vals) do
                local id = tonumber(tostring(txt):match("%((%d+)%)"))
                if id then
                    table.insert(ids, id)
                end
            end
            cr_priorityRaidIds = ids
        end,
    })

    -- Start/Stop
    csec:Toggle({
        Title    = "Start / Stop",
        Desc     = "Announcement → lowest (World×Grade) → start → 25s cooldown loop until raid closes",
        Default  = false,
        Callback = function(on)
            cr_running = on and true or false
            if not cr_running then
                cr_fireSettingAutoDraw(false)
                cr_inCycle    = false
                cr_lastRaidId = nil
            end
        end,
    })
end
