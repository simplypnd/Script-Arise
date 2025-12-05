-- RaidHunter.lua — normal raid hunter + rune + autodraw + kill aura (WindUI, Worlds×Grades)

----------------------------------------------------------------
-- Services / modules
----------------------------------------------------------------
local Players           = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService        = game:GetService("RunService")
local LocalPlayer       = Players.LocalPlayer

local NotifyManager   = require(ReplicatedStorage.Scripts.Share.Manager.NotifyManager)
local AgentManager    = require(ReplicatedStorage.Scripts.Share.Manager.AgentManager)
local RaidsManager    = require(ReplicatedStorage.Scripts.Client.Manager.RaidsManager)
local ConfigManager   = require(ReplicatedStorage.Scripts.Share.Manager.ConfigManager)
local EnemyManager    = require(ReplicatedStorage.Scripts.Client.Manager.EnemyManager)

local Remotes       = ReplicatedStorage:WaitForChild("Remotes")
local R_CreateTeam  = Remotes:WaitForChild("CreateRaidTeam")
local R_StartRaid   = Remotes:WaitForChild("StartChallengeRaidMap")
local R_UseRaidItem = Remotes:WaitForChild("UseRaidItem")
local R_Setting     = Remotes:WaitForChild("Setting")
local AttackRemote  = Remotes:FindFirstChild("PlayerClickAttackSkill")

----------------------------------------------------------------
-- Live config data via ConfigManager
----------------------------------------------------------------
local RaidsConfigData = {}
local ItemConfigData  = {}
local MapConfigData   = {}

do
    local raidsCfg = ConfigManager.GetConfig("Raids")
    if raidsCfg and type(raidsCfg.originalData) == "table" then
        RaidsConfigData = raidsCfg.originalData
    end

    local itemCfg = ConfigManager.GetConfig("Item")
    if itemCfg and type(itemCfg.originalData) == "table" then
        ItemConfigData = itemCfg.originalData
    end

    local mapCfg = ConfigManager.GetConfig("Map")
    if mapCfg and type(mapCfg.originalData) == "table" then
        MapConfigData = mapCfg.originalData
    end
end

----------------------------------------------------------------
-- State
----------------------------------------------------------------
local useRuneEnabled      = false
local selectedRuneItemId  = nil
local autoDrawEnabled     = false
local killAuraEnabled     = false
local running             = false

local function now() return os.clock() end

local lastJoinTick   = 0
local inCycle        = false
local lastRaidId     = nil
local lastStartTime  = {}   -- [raidId] = os.clock()
local openRaidIds    = {}   -- [raidId] = true while announced

-- Kill aura (only in raid, filters by enemyLevel == current raid level)
_G.RHKillAuraEnabled   = _G.RHKillAuraEnabled or false
_G.RHHitboxSize        = _G.RHHitboxSize or 2000

local killAuraThread

local function getCurrentRaidLevel()
    if RaidsManager and RaidsManager.raidsMapInfo then
        return RaidsManager.raidsMapInfo.currentLevel
    end
    return nil
end

local function startKillAura()
    if killAuraThread then return end
    killAuraThread = task.spawn(function()
        while _G.RHKillAuraEnabled do
            if AttackRemote and EnemyManager and EnemyManager.enemyEntitys then
                local level = getCurrentRaidLevel()
                if level then
                    for guid, enemy in pairs(EnemyManager.enemyEntitys) do
                        if enemy
                           and enemy.data
                           and enemy.data.hp
                           and enemy.data.hp > 0
                           and enemy.data.enemyLevel == level then
                            pcall(function()
                                AttackRemote:FireServer({ attackEnemyGUID = guid })
                            end)
                        end
                    end
                end
            end
            task.wait(0.1)
        end
        killAuraThread = nil
    end)
end

RunService.RenderStepped:Connect(function()
    if not _G.RHKillAuraEnabled then return end
    local enemysFolder = workspace:FindFirstChild("Enemys")
    if not enemysFolder then return end

    for _, npc in ipairs(enemysFolder:GetChildren()) do
        if npc:IsA("Model") then
            local hrp = npc:FindFirstChild("HumanoidRootPart")
            local nameGui = hrp and hrp:FindFirstChild("EnemyNameGui")
            if hrp and nameGui then
                pcall(function()
                    hrp.Size       = Vector3.new(_G.RHHitboxSize, _G.RHHitboxSize, _G.RHHitboxSize)
                    hrp.CanCollide = false
                end)
            end
        end
    end
end)

local function fireSettingAutoDraw(flag)
    if not autoDrawEnabled then return end
    local args = {
        {
            key   = "autoDraw",
            value = flag and true or false,
        }
    }
    pcall(function()
        R_Setting:FireServer(unpack(args))
    end)
end

local function useSelectedRune()
    if not useRuneEnabled or not selectedRuneItemId then return end
    pcall(function()
        R_UseRaidItem:FireServer(selectedRuneItemId)
    end)
end

local function createAndStartRaid(raidId)
    if not raidId then return end

    if R_CreateTeam then
        pcall(function()
            R_CreateTeam:InvokeServer(raidId)
        end)
    end

    -- short delay for team to register
    task.wait(0.4)

    -- use rune while still in lobby/team context
    useSelectedRune()

    if R_StartRaid then
        pcall(function()
            R_StartRaid:FireServer()
            lastStartTime[raidId] = os.clock()
        end)
    end
end

local function isInRaid()
    return RaidsManager and RaidsManager.raidsMapInfo ~= nil
end

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
-- World / grade selection (Up5-style)
----------------------------------------------------------------
local GRADE_INDEX = { E=1, D=2, C=3, B=4, A=5, S=6, SS=7, G=8, N=9, M=10 }
local GRADE_ORDER = { "E","D","C","B","A","S","SS","G","N","M" }

local WORLD_LIST, WORLD_NAME = {}, {}

do
    -- Pretty names from Map config: "1,Shadow Gate City", etc.
    if type(MapConfigData) == "table" then
        for _, m in ipairs(MapConfigData) do
            local raw = m.MapName or m["MapName"]
            if type(raw) == "string" then
                local n, rest = raw:match("^(%d+)%s*,%s*(.+)$")
                if n and rest then
                    WORLD_NAME[tonumber(n)] = rest
                end
            end
        end
    end

    -- Worlds from RaidsConfig ids (930000 + (world-1)*10 + gradeIndex)
    local seen = {}
    if type(RaidsConfigData) == "table" then
        for _, r in ipairs(RaidsConfigData) do
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

local selectedWorlds = {}   -- {1,2,3...}
local selectedGrades = {}   -- {"E","S",...} empty = All

local function raidIdFromWorldGrade(world, gradeLetter)
    local gi = GRADE_INDEX[gradeLetter]
    if not gi then return nil end
    return 930000 + (world - 1) * 10 + gi
end

local function buildSelectedRaidIdSet()
    local set = {}
    local grades = (#selectedGrades == 0) and GRADE_ORDER or selectedGrades
    for _, w in ipairs(selectedWorlds) do
        for _, g in ipairs(grades) do
            local id = raidIdFromWorldGrade(w, g)
            if id then set[id] = true end
        end
    end
    return set
end

local function pickLowestWantedOpen()
    local wanted = buildSelectedRaidIdSet()
    local lowest
    for rid, _ in pairs(openRaidIds) do
        if wanted[rid] then
            if not lowest or rid < lowest then
                lowest = rid
            end
        end
    end
    return lowest
end

----------------------------------------------------------------
-- Retry loop: 25s from start; repeat until raid closes
----------------------------------------------------------------
local function scheduleRetryLoop(raidId)
    task.spawn(function()
        while running do
            if not openRaidIds[raidId] then
                inCycle    = false
                lastRaidId = nil
                return
            end

            local startedAt = lastStartTime[raidId] or os.clock()
            local elapsed   = os.clock() - startedAt
            local waitSecs  = (elapsed >= 25) and 1 or (25 - elapsed)

            task.wait(waitSecs)
            if not running or not openRaidIds[raidId] then
                inCycle    = false
                lastRaidId = nil
                return
            end

            inCycle = true
            createAndStartRaid(raidId)

            -- Watchdog: 10s to actually enter raid
            local deadline = os.clock() + 10
            local entered  = false
            while os.clock() < deadline do
                if isInRaid() then
                    entered = true
                    break
                end
                RunService.Heartbeat:Wait()
            end

            if entered then
                return
            end

            lastStartTime[raidId] = os.clock()
        end

        inCycle    = false
        lastRaidId = nil
    end)
end

----------------------------------------------------------------
-- Raid announcements
----------------------------------------------------------------
NotifyManager.RegisterClientEvent(
    NotifyManager.EventData.UpdateRaidInfo,
    function(payload)
        if not payload or not payload.action then return end

        -- maintain openSet
        if payload.action == "AddRaidEnters" and payload.raidInfos then
            for _, info in pairs(payload.raidInfos) do
                if info.raidId then
                    openRaidIds[info.raidId] = true
                end
            end
        elseif payload.action == "RemoveRaidEnters" and payload.raidInfos then
            for _, info in pairs(payload.raidInfos) do
                if info.raidId then
                    openRaidIds[info.raidId] = nil
                end
            end
        end

        if not running then return end
        if payload.action ~= "AddRaidEnters" or not payload.raidInfos then return end
        if #selectedWorlds == 0 then return end
        if inCycle then return end

        local target = pickLowestWantedOpen()
        if not target then return end

        local t = now()
        if t - lastJoinTick < 5 then return end
        lastJoinTick = t
        inCycle      = true
        lastRaidId   = target
        createAndStartRaid(target)
    end
)

----------------------------------------------------------------
-- Raid events: enter / success / leave
----------------------------------------------------------------
AgentManager.RegisterEvent(AgentManager.EventNames.EnterRaidsMap, function(_mapId)
    if not running then return end
    if not lastRaidId then return end

    fireSettingAutoDraw(true)

    if killAuraEnabled then
        _G.RHKillAuraEnabled = true
        startKillAura()
    end
end)

AgentManager.RegisterEvent(AgentManager.EventNames.GainRaidsSuccessChest, function(_data)
    if not running then return end
    if not lastRaidId then return end

    fireSettingAutoDraw(false)
    _G.RHKillAuraEnabled = false

    -- try to find and teleport to EnchantChest before quitting
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
    end)

    task.delay(1, function()
        pcall(function()
            if RaidsManager and RaidsManager.QuitRaidMap then
                RaidsManager.QuitRaidMap()
            end
        end)
    end)

    scheduleRetryLoop(lastRaidId)
end)

AgentManager.RegisterEvent(AgentManager.EventNames.LeaveRaidsMap, function(_mapId)
    if not running then return end
    fireSettingAutoDraw(false)
    _G.RHKillAuraEnabled = false
    inCycle    = false
    lastRaidId = nil
end)

----------------------------------------------------------------
-- WindUI UI
----------------------------------------------------------------
local WindUI = loadstring(game:HttpGet(
    "https://github.com/Footagesus/WindUI/releases/latest/download/main.lua"
))()

local parent = (gethui and gethui())
    or (pcall(function() return game:GetService("CoreGui") end) and game:GetService("CoreGui"))
    or LocalPlayer:WaitForChild("PlayerGui")
if WindUI.SetParent then WindUI:SetParent(parent) end

local Window = WindUI:CreateWindow({
    Title        = "Raid Hunter",
    Size         = UDim2.fromOffset(420, 260),
    Transparent  = true,
    Resizable    = true,
    SideBarWidth = 180,
})
Window:SetToggleKey(Enum.KeyCode.RightShift)
Window:Open()

local tabMain = Window:Tab({ Title = "Main", Icon = "lucide:sword" })
local sec     = tabMain:Section({ Title = "Raid Hunter", Opened = true })

---------------------------------------------------------------
-- Worlds dropdown (multi)
---------------------------------------------------------------
local worldLabels = {}
for _, w in ipairs(WORLD_LIST) do
    local label = ("World %d%s"):format(
        w,
        WORLD_NAME[w] and (" — "..WORLD_NAME[w]) or ""
    )
    table.insert(worldLabels, label)
end

sec:Dropdown({
    Title     = "Worlds",
    Desc      = "Select raid worlds (multi)",
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
        selectedWorlds = chosen

        if #selectedWorlds > 0 then
            local pretty = {}
            for _, w in ipairs(selectedWorlds) do
                table.insert(pretty, WORLD_NAME[w] and (w.." ("..WORLD_NAME[w]..")") or tostring(w))
            end
            WindUI:Notify({
                Title   = "Raid Hunter",
                Content = "Worlds: "..table.concat(pretty, ", "),
                Duration= 2
            })
        else
            WindUI:Notify({
                Title   = "Raid Hunter",
                Content = "Select at least one world.",
                Duration= 2
            })
        end
    end,
})

---------------------------------------------------------------
-- Grades dropdown (multi)
---------------------------------------------------------------
local GRADE_OPTIONS = { "All","E","D","C","B","A","S","SS","G","N","M" }

sec:Dropdown({
    Title     = "Grades",
    Desc      = "Select raid grades (multi; All = any)",
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
            selectedGrades = {}
            WindUI:Notify({
                Title   = "Raid Hunter",
                Content = "Grades: All",
                Duration= 2
            })
        else
            selectedGrades = list
            WindUI:Notify({
                Title   = "Raid Hunter",
                Content = "Grades: "..table.concat(list, ", "),
                Duration= 2
            })
        end
    end,
})

---------------------------------------------------------------
-- Rune list & UI
---------------------------------------------------------------
local runeDropdownValues = {}

local function rebuildRuneList()
    runeDropdownValues = {}

    if type(ItemConfigData) ~= "table" then
        return
    end

    local tmp = {}
    for _, it in ipairs(ItemConfigData) do
        local id   = it.Id or it["Id"]
        local name = it.Name or it["Name"]
        if id and name and tostring(name):find("Rune") then
            table.insert(tmp, { id = id, name = tostring(name) })
        end
    end

    table.sort(tmp, function(a,b) return a.id < b.id end)
    for _, r in ipairs(tmp) do
        table.insert(runeDropdownValues, ("%s (%d)"):format(r.name, r.id))
    end
end

rebuildRuneList()

sec:Toggle({
    Title    = "Use Rune",
    Desc     = "Send UseRaidItem when raid starts",
    Default  = useRuneEnabled,
    Callback = function(on)
        useRuneEnabled = on and true or false
    end,
})

sec:Dropdown({
    Title     = "Rune",
    Desc      = "Which rune item to use",
    Values    = (#runeDropdownValues > 0) and runeDropdownValues or { "None" },
    Value     = (#runeDropdownValues > 0) and runeDropdownValues[1] or "None",
    Multi     = false,
    AllowNone = true,
    Callback  = function(v)
        local txt = (type(v)=="table") and v[1] or v
        if not txt or txt == "None" then
            selectedRuneItemId = nil
            return
        end
        local id = tonumber(txt:match("%((%d+)%)"))
        selectedRuneItemId = id
        if id then
            WindUI:Notify({ Title="Raid Hunter", Content="Rune set to "..txt, Duration=2 })
        end
    end,
})

---------------------------------------------------------------
-- Autodraw toggle
---------------------------------------------------------------
sec:Toggle({
    Title    = "Autodraw / Arise",
    Desc     = "Toggle Setting.autoDraw true/false inside raid",
    Default  = autoDrawEnabled,
    Callback = function(on)
        autoDrawEnabled = on and true or false
    end,
})

---------------------------------------------------------------
-- Kill Aura toggle
---------------------------------------------------------------
sec:Toggle({
    Title    = "Kill Aura",
    Desc     = "Enable kill aura while inside raid",
    Default  = killAuraEnabled,
    Callback = function(on)
        killAuraEnabled = on and true or false
    end,
})

---------------------------------------------------------------
-- Start / Stop
---------------------------------------------------------------
sec:Toggle({
    Title    = "Start / Stop",
    Desc     = "Announcement → lowest (World×Grade) → start → 25s cooldown loop until raid closes",
    Default  = false,
    Callback = function(on)
        running = on and true or false
        if not running then
            fireSettingAutoDraw(false)
            _G.RHKillAuraEnabled = false
            inCycle    = false
            lastRaidId = nil
        end
        WindUI:Notify({
            Title   = "Raid Hunter",
            Content = running and "Started" or "Stopped",
            Duration= 2
        })
    end,
})

tabMain:Paragraph({
    Title = "Flow",
    Desc  = "Select Worlds and Grades. When any matching raid appears, the script joins the lowest ID, uses optional rune, toggles autodraw + kill aura, and after each success waits to satisfy the ~25s cooldown (since start) before retrying until the raid closes.",
})

Window:OnDestroy(function()
    running = false
    fireSettingAutoDraw(false)
    _G.RHKillAuraEnabled = false
end)
