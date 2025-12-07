-- AuraKillv2.lua — Kill Aura + Dual Challenge Profiles (Challenge / Priority)

-- Single-instance guard so the UI / logic
-- is not created twice on re-execute.
if getgenv().AuraKillV2_Started then
    return
end
getgenv().AuraKillV2_Started = true

----------------------------------------------------------------
-- Services / modules
----------------------------------------------------------------
local Players           = game:GetService("Players")
local RunService        = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local LocalPlayer       = Players.LocalPlayer

-- Ensure game and character are fully loaded before continuing
repeat
    task.wait()
until game:IsLoaded()
    and Players
    and Players.LocalPlayer
    and Players.LocalPlayer.Character

local EnemyManager    = require(ReplicatedStorage.Scripts.Client.Manager.EnemyManager)
local NotifyManager   = require(ReplicatedStorage.Scripts.Share.Manager.NotifyManager)
local AgentManager    = require(ReplicatedStorage.Scripts.Share.Manager.AgentManager)
local RaidsManager    = require(ReplicatedStorage.Scripts.Client.Manager.RaidsManager)
local RaidsConfig     = require(ReplicatedStorage.Scripts.Configs.Raids)
local SettingManager  = require(ReplicatedStorage.Scripts.Client.Manager.SettingManager)
local Keys            = require(ReplicatedStorage.Scripts.Share.Keys)
local MAPS            = require(ReplicatedStorage.Scripts.Configs.Map)
local MonsterConfig   = require(ReplicatedStorage.Scripts.Configs.Monster)
local ExtraService    = require(ReplicatedStorage.Scripts.Client.Services.ExtraService)

local Remotes         = ReplicatedStorage:WaitForChild("Remotes")
local AttackRemote    = Remotes:FindFirstChild("PlayerClickAttackSkill")
local R_CreateTeam    = Remotes:FindFirstChild("CreateRaidTeam")
local R_StartRaid     = Remotes:FindFirstChild("StartChallengeRaidMap")
local R_UseRaidItem   = Remotes:FindFirstChild("UseRaidItem")
local R_Setting       = Remotes:FindFirstChild("Setting")
local R_ExtraReward   = Remotes:FindFirstChild("ExtraReward")

----------------------------------------------------------------
-- Basic Anti-AFK (VirtualUser) so you don't get kicked
----------------------------------------------------------------
do
    local ok, vu = pcall(function()
        return game:service("VirtualUser")
    end)
    if ok and vu then
        game:service("Players").LocalPlayer.Idled:Connect(function()
            pcall(function()
                vu:CaptureController()
                vu:ClickButton2(Vector2.new())
            end)
        end)
    end
end

----------------------------------------------------------------
-- Global Kill Aura (Up5-style)
----------------------------------------------------------------
_G.KillAuraEnabled = _G.KillAuraEnabled or false
_G.HitboxSize      = _G.HitboxSize or 2
_G.NPCFolder       = workspace:FindFirstChild("Enemys")

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

-- Hitbox expansion (only for models that look like real enemies: have EnemyNameGui)
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
-- Chest helpers (EnchantChest)
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

local function findEnchantChest()
    -- Try direct child first
    local chest = workspace:FindFirstChild("EnchantChest")
    if chest then return chest end

    -- Fallback: search descendants by name contains "EnchantChest"
    for _, inst in ipairs(workspace:GetDescendants()) do
        if inst:IsA("Model") or inst:IsA("BasePart") then
            if tostring(inst.Name):find("EnchantChest") then
                return inst
            end
        end
    end
    return nil
end
----------------------------------------------------------------
-- WindUI window
----------------------------------------------------------------
local WindUI = loadstring(game:HttpGet(
    "https://github.com/Footagesus/WindUI/releases/latest/download/main.lua"
))()

local parent = (gethui and gethui())
    or (pcall(function() return game:GetService("CoreGui") end) and game:GetService("CoreGui"))
    or LocalPlayer:WaitForChild("PlayerGui")
if WindUI.SetParent then WindUI:SetParent(parent) end

local Window = WindUI:CreateWindow({
    Title        = "AuraKill v2",
    Size         = UDim2.fromOffset(420, 280),
    Transparent  = true,
    Resizable    = true,
    SideBarWidth = 160,
})
Window:SetToggleKey(Enum.KeyCode.RightShift)
Window:Open()

local tabAura  = Window:Tab({ Title="Aura",      Icon="lucide:sparkles" })
local tabCR    = Window:Tab({ Title="Challenge", Icon="lucide:sword" })
local tabExtra = Window:Tab({ Title="Extra",     Icon="lucide:gift" })
local tabMisc  = Window:Tab({ Title="Misc",      Icon="lucide:wrench" })

-- WindUI ConfigManager for saving/loading settings (optional, some builds don't include it)
local ConfigManager = Window.ConfigManager
local AuraConfig
if ConfigManager then
    AuraConfig = ConfigManager:CreateConfig("AuraKillv2")
else
    -- Fallback stub so the rest of the script still runs even if ConfigManager doesn't exist
    AuraConfig = {
        Register = function() end,
        Save     = function() end,
        Load     = function() end,
    }
end

local autoLoadFlag  = (getgenv().AuraKill_AutoLoad == true)

----------------------------------------------------------------
-- Aura tab (global kill aura)
----------------------------------------------------------------
do
    local sec = tabAura:Section({ Title="Kill Aura", Opened=true })

    local killAuraToggle = sec:Toggle({
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

    local hitboxSlider = sec:Slider({
        Title = "Hitbox Size",
        Step  = 1,
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

    AuraConfig:Register("KillAuraToggle", killAuraToggle)
    AuraConfig:Register("HitboxSlider",   hitboxSlider)
end

Window:OnDestroy(function()
    stopAttackLoop()
end)

----------------------------------------------------------------
-- Shared raid config mapping (Worlds × Grades)
----------------------------------------------------------------
local GRADE_INDEX = { E=1, D=2, C=3, B=4, A=5, S=6, SS=7, G=8, N=9, M=10 }
local GRADE_ORDER = { "E","D","C","B","A","S","SS","G","N","M" }

local WORLD_LIST, WORLD_NAME = {}, {}

do
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
-- Profile engine helper (Challenge / Priority)
----------------------------------------------------------------
local function newProfile()
    return {
        useRuneEnabled     = false,
        selectedRuneItemId = nil,
        autoDrawEnabled    = false,
        autoAuraEnabled    = false,
        running            = false,

        lastJoinTick       = 0,
        inCycle            = false,
        lastRaidId         = nil,
        lastStartTime      = {},   -- [raidId] = os.clock()

        selectedWorlds     = {},
        selectedGrades     = {},
    }
end

local profileChallenge = newProfile()
local profilePriority  = newProfile()

----------------------------------------------------------------
-- Extra tab state (selective arise/destroy by monster / grade)
----------------------------------------------------------------
local Extra_SelectedMonsterIds   = {} -- [baseMonsterName] = true
local Extra_SelectedGrades       = {} -- [gradeLetter] = true; empty = all
local Extra_SelectEnabled        = false

----------------------------------------------------------------
-- Monster config helpers: Id -> Grade / BaseName
----------------------------------------------------------------
local MonsterIdToGrade = {}
local MonsterIdToBaseName = {}

do
    if type(MonsterConfig) == "table" then
        for _, m in ipairs(MonsterConfig) do
            local id   = m.Id or m["Id"]
            local name = m.Name or m["Name"]
            if id and type(name) == "string" then
                -- capture E / D / C / B / A / S / SS / G / N / M from trailing [X]
                local g = name:match("%[(%u+)%]")
                if g and GRADE_INDEX[g] then
                    MonsterIdToGrade[id] = g
                end

                -- strip trailing " [X]" to get base monster name
                local base = name:gsub("%s*%[[^%]]+%]", "")
                base = base:gsub("%s+$", "")
                MonsterIdToBaseName[id] = base
            end
        end
    end
end

local function getMonsterGradeLetter(monsterId)
    return MonsterIdToGrade[monsterId]
end

----------------------------------------------------------------
-- ExtraService hook: Selective Extra (ARISE / DESTROY)
-- (temporarily disabled for testing EnchantChest teleport)
----------------------------------------------------------------
--[[
-- guid -> info (from ExtraService.GenerateExtract payload.info)
local Extra_InfoByGuid = {} -- [guid] = { monsterId = ..., rawInfo = ... }

if ExtraService then
    -- wrap GenerateExtract to cache monsterId by guid
    local oldGenerateExtract = ExtraService.GenerateExtract
    ExtraService.GenerateExtract = function(payload)
        local ok, info = pcall(function()
            return payload and payload.info
        end)

        if ok and info and info.guid and info.monsterId then
            Extra_InfoByGuid[info.guid] = {
                monsterId = info.monsterId,
                rawInfo   = info,
            }
        end

        local result = oldGenerateExtract(payload)

        -- If selective logic is enabled, force a decision immediately,
        -- independent of in-game autoDraw / autoSell settings.
        if ok and info and info.guid and Extra_SelectEnabled then
            task.defer(function()
                ExtraService.AutoTrigger(info.guid)
            end)
        end

        return result
    end

    -- decide ARISE / DESTROY based on Selective Extra settings
    local function shouldAriseFor(info)
        if not Extra_SelectEnabled then
            return nil -- feature off -> fall back to original autoSell/autoDraw
        end

        -- 1) Monster filter (by base name)
        if next(Extra_SelectedMonsterIds) then
            local baseName = MonsterIdToBaseName[info.monsterId]
            if not baseName or not Extra_SelectedMonsterIds[baseName] then
                return false -- DESTROY
            end
        end

        -- 2) Grade filter (optional AND on top of monster filter)
        if next(Extra_SelectedGrades) then
            local gradeLetter = getMonsterGradeLetter(info.monsterId)
            -- If a grade is selected, only those grades may ARISE.
            -- Monsters with no grade or a non-selected grade are DESTROYed.
            if not gradeLetter or not Extra_SelectedGrades[gradeLetter] then
                return false -- DESTROY
            end
        end

        -- passed all active filters -> ARISE
        return true
    end

    -- wrap AutoTrigger so our filters take over when active
    local oldAutoTrigger = ExtraService.AutoTrigger
    ExtraService.AutoTrigger = function(guid)
        local info = Extra_InfoByGuid[guid]
        local decision = info and shouldAriseFor(info) or nil

        -- When selective extra is enabled, every valid Extra must resolve
        -- to either ARISE (true) or DESTROY (false). Treat nil as DESTROY.
        if Extra_SelectEnabled and info then
            if decision == true then
                return ExtraService.DrawPromptTriggeredHandle(Players.LocalPlayer, guid)
            else
                return ExtraService.SellPromptTriggeredHandle(Players.LocalPlayer, guid)
            end
        end

        -- If feature is off or info missing, keep original behavior.
        if decision == true then
            return ExtraService.DrawPromptTriggeredHandle(Players.LocalPlayer, guid)
        elseif decision == false then
            return ExtraService.SellPromptTriggeredHandle(Players.LocalPlayer, guid)
        else
            return oldAutoTrigger(guid)
        end
    end
end
]]

-- open raid set is shared
local openRaidIds = {}   -- [raidId] = true

local function buildSelectedRaidIdSet(profile)
    local set   = {}
    local grades= (#profile.selectedGrades == 0) and GRADE_ORDER or profile.selectedGrades
    for _, w in ipairs(profile.selectedWorlds) do
        for _, g in ipairs(grades) do
            local id = raidIdFromWorldGrade(w, g)
            if id then set[id] = true end
        end
    end
    return set
end

local function pickLowestOpen(profile)
    local wanted = buildSelectedRaidIdSet(profile)
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

local function now() return os.clock() end

local function profileFireSettingAutoDraw(profile, flag)
    if not profile.autoDrawEnabled then return end
    if not R_Setting then return end
    local payload
    if flag then
        -- Enable autoDraw only if it's not already true
        local ok, current = pcall(SettingManager.getValue, Keys.Setting.autoDraw)
        if ok and current == true then return end
        payload = { { key = "autoDraw", value = true } }
    else
        -- "Disable" autoDraw by enabling autoSell, but avoid spamming if it's already true
        local ok, current = pcall(SettingManager.getValue, Keys.Setting.autoSell)
        if ok and current == true then return end
        payload = { { key = "autoSell", value = true } }
    end
    pcall(function()
        R_Setting:FireServer(unpack(payload))
    end)
end

local function profileUseRune(profile)
    if not profile.useRuneEnabled or not profile.selectedRuneItemId then return end
    if not R_UseRaidItem then return end
    pcall(function()
        R_UseRaidItem:FireServer(profile.selectedRuneItemId)
    end)
end

local function profileCreateAndStart(profile, raidId)
    if not raidId then return end

    if R_CreateTeam then
        pcall(function()
            R_CreateTeam:InvokeServer(raidId)
        end)
    end

    task.wait(0.4)
    profileUseRune(profile)

    if R_StartRaid then
        pcall(function()
            R_StartRaid:FireServer()
            profile.lastStartTime[raidId] = os.clock()
            profileFireSettingAutoDraw(profile, true)
            if profile.autoAuraEnabled then
                _G.KillAuraEnabled = true
                startAttackLoop()
            end
        end)
    end
end

local function profileScheduleRetry(profile, raidId)
    task.spawn(function()
        while profile.running do
            if not openRaidIds[raidId] then
                profile.inCycle   = false
                profile.lastRaidId= nil
                return
            end

            local startedAt = profile.lastStartTime[raidId] or os.clock()
            local elapsed   = os.clock() - startedAt
            local waitSecs  = (elapsed >= 30) and 1 or (30 - elapsed)

            task.wait(waitSecs)
            if not profile.running or not openRaidIds[raidId] then
                profile.inCycle   = false
                profile.lastRaidId= nil
                return
            end

            profile.inCycle   = true
            profile.lastRaidId= raidId
            profileCreateAndStart(profile, raidId)

            local deadline = os.clock() + 10
            while os.clock() < deadline do
                if RaidsManager and RaidsManager.raidsMapInfo ~= nil then
                    return
                end
                RunService.Heartbeat:Wait()
            end

            profile.lastStartTime[raidId] = os.clock()
        end

        profile.inCycle   = false
        profile.lastRaidId= nil
    end)
end

----------------------------------------------------------------
-- Shared UpdateRaidInfo handler → feeds both profiles
----------------------------------------------------------------
NotifyManager.RegisterClientEvent(
    NotifyManager.EventData.UpdateRaidInfo,
    function(payload)
        if not payload or not payload.action then return end

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

        local function handleProfile(profile)
            if not profile.running then return end
            if payload.action ~= "AddRaidEnters" or not payload.raidInfos then return end
            if #profile.selectedWorlds == 0 then return end
            if profile.inCycle then return end

            local target = pickLowestOpen(profile)
            if not target then return end

            local t = now()
            if t - profile.lastJoinTick < 5 then return end
            profile.lastJoinTick = t
            profile.inCycle      = true
            profile.lastRaidId   = target
            profileCreateAndStart(profile, target)
        end

        -- Priority first, then Challenge (so they don't compete if both running)
        handleProfile(profilePriority)
        handleProfile(profileChallenge)
    end
)

----------------------------------------------------------------
-- Success handlers (challenge & normal raids)
----------------------------------------------------------------
local function handleProfileSuccess(profile)
    if not profile.running then return end
    if not profile.lastRaidId then return end

    profileFireSettingAutoDraw(profile, false)
    if profile.autoAuraEnabled then
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
            for attempt = 1, 3 do
                local ok = teleportToChestInside(chest)
                if ok then
                    break
                end
                task.wait(5)
                if not workspace:FindFirstChild("EnchantChest") then
                    break
                end
                chest = workspace:FindFirstChild("EnchantChest")
                if not chest then
                    break
                end
            end
        end

        local t1 = os.clock()
        while os.clock() - t1 < 10 do
            if not workspace:FindFirstChild("EnchantChest") then
                break
            end
            task.wait(0.2)
        end

        pcall(function()
            if RaidsManager and RaidsManager.QuitRaidMap then
                task.wait(1)
                RaidsManager.QuitRaidMap()
            end
        end)

        profile.inCycle = true
        profileScheduleRetry(profile, profile.lastRaidId)
    end)
end

NotifyManager.RegisterClientEvent(NotifyManager.EventData.ChallengeRaidsSuccess, function(_payload)
    handleProfileSuccess(profilePriority)
    handleProfileSuccess(profileChallenge)
end)

AgentManager.RegisterEvent(AgentManager.EventNames.GainRaidsSuccessChest, function(_data)
    handleProfileSuccess(profilePriority)
    handleProfileSuccess(profileChallenge)
end)

-- If you leave a raid without a success event (fail / manual leave),
-- make sure AutoArise / Auto Kill Aura are turned off for both profiles.
AgentManager.RegisterEvent(AgentManager.EventNames.LeaveRaidsMap, function(_mapId)
    local profiles = { profilePriority, profileChallenge }
    for _, profile in ipairs(profiles) do
        if profile.running then
            profileFireSettingAutoDraw(profile, false)
            if profile.autoAuraEnabled then
                _G.KillAuraEnabled = false
            end
            profile.inCycle   = false
            profile.lastRaidId= nil
        end
    end
end)

----------------------------------------------------------------
-- Challenge tab UI
----------------------------------------------------------------
do
    -- Shared world labels
    local worldLabels = {}
    for _, w in ipairs(WORLD_LIST) do
        local label = ("World %d%s"):format(
            w,
            WORLD_NAME[w] and (" — "..WORLD_NAME[w]) or ""
        )
        table.insert(worldLabels, label)
    end

    -- Shared rune list
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

    ----------------------------------------------------------------
    -- Challenge Raid Section (general profile)
    ----------------------------------------------------------------
    local cg = profileChallenge
    local secC = tabCR:Section({ Title = "Challenge Raid", Opened = true })

    local chWorldsDropdown = secC:Dropdown({
        Title     = "Worlds",
        Desc      = "Select World",
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
            cg.selectedWorlds = chosen
        end,
    })

    local GRADE_OPTIONS = { "All","E","D","C","B","A","S","SS","G","N","M" }

    local chGradesDropdown = secC:Dropdown({
        Title     = "Grades",
        Desc      = "Lowest Grade will be picked",
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
                cg.selectedGrades = {}
            else
                cg.selectedGrades = list
            end
        end,
    })

    local chUseRuneToggle = secC:Toggle({
        Title    = "Use Rune",
        Desc     = "",
        Default  = cg.useRuneEnabled,
        Callback = function(on)
            cg.useRuneEnabled = on and true or false
        end,
    })

    local chRuneDropdown = secC:Dropdown({
        Title     = "Rune",
        Desc      = "Select Rune",
        Values    = (#runeValues > 0) and runeValues or { "None" },
        Value     = (#runeValues > 0) and runeValues[1] or "None",
        Multi     = false,
        AllowNone = true,
        Callback  = function(v)
            local txt = (type(v)=="table") and v[1] or v
            if not txt or txt == "None" then
                cg.selectedRuneItemId = nil
                return
            end
            local id = tonumber(txt:match("%((%d+)%)"))
            cg.selectedRuneItemId = id
        end,
    })

    local chAutoDrawToggle = secC:Toggle({
        Title    = "AutoArise",
        Desc     = "Activated when in raid only",
        Default  = cg.autoDrawEnabled,
        Callback = function(on)
            cg.autoDrawEnabled = on and true or false
        end,
    })

    local chAutoAuraToggle = secC:Toggle({
        Title    = "Auto Kill Aura",
        Desc     = "Activated when in raid only",
        Default  = cg.autoAuraEnabled,
        Callback = function(on)
            cg.autoAuraEnabled = on and true or false
        end,
    })

    local chStartToggle = secC:Toggle({
        Title    = "Start (Challenge)",
        Desc     = "",
        Default  = false,
        Callback = function(on)
            cg.running = on and true or false
            if not cg.running then
                profileFireSettingAutoDraw(cg, false)
                cg.inCycle   = false
                cg.lastRaidId= nil
            end
        end,
    })

    -- Register Challenge profile elements with config
    AuraConfig:Register("ChWorlds",    chWorldsDropdown)
    AuraConfig:Register("ChGrades",    chGradesDropdown)
    AuraConfig:Register("ChUseRune",   chUseRuneToggle)
    AuraConfig:Register("ChRune",      chRuneDropdown)
    AuraConfig:Register("ChAutoArise", chAutoDrawToggle)
    AuraConfig:Register("ChAutoAura",  chAutoAuraToggle)
    AuraConfig:Register("ChStart",     chStartToggle)

    ----------------------------------------------------------------
    -- Priority Raid Section (priority profile)
    ----------------------------------------------------------------
    local cp = profilePriority
    local secP = tabCR:Section({ Title = "Priority Raid", Opened = false })

    local prWorldsDropdown = secP:Dropdown({
        Title     = "Worlds",
        Desc      = "Select World",
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
            cp.selectedWorlds = chosen
        end,
    })

    local prGradesDropdown = secP:Dropdown({
        Title     = "Grades",
        Desc      = "Lowest Grade will be picked",
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
                cp.selectedGrades = {}
            else
                cp.selectedGrades = list
            end
        end,
    })

    local prUseRuneToggle = secP:Toggle({
        Title    = "Use Rune",
        Desc     = "",
        Default  = cp.useRuneEnabled,
        Callback = function(on)
            cp.useRuneEnabled = on and true or false
        end,
    })

    local prRuneDropdown = secP:Dropdown({
        Title     = "Rune",
        Desc      = "Activated when in raid only",
        Values    = (#runeValues > 0) and runeValues or { "None" },
        Value     = (#runeValues > 0) and runeValues[1] or "None",
        Multi     = false,
        AllowNone = true,
        Callback  = function(v)
            local txt = (type(v)=="table") and v[1] or v
            if not txt or txt == "None" then
                cp.selectedRuneItemId = nil
                return
            end
            local id = tonumber(txt:match("%((%d+)%)"))
            cp.selectedRuneItemId = id
        end,
    })

    local prAutoDrawToggle = secP:Toggle({
        Title    = "Autodraw / Arise",
        Desc     = "Toggle autoDraw for Priority profile",
        Default  = cp.autoDrawEnabled,
        Callback = function(on)
            cp.autoDrawEnabled = on and true or false
        end,
    })

    local prAutoAuraToggle = secP:Toggle({
        Title    = "Auto Kill Aura",
        Desc     = "Auto-toggle kill aura in Priority raids",
        Default  = cp.autoAuraEnabled,
        Callback = function(on)
            cp.autoAuraEnabled = on and true or false
        end,
    })

    local prStartToggle = secP:Toggle({
        Title    = "Start (Priority)",
        Desc     = "Runs on announced raids matching Priority Worlds×Grades (takes priority over Challenge)",
        Default  = false,
        Callback = function(on)
            cp.running = on and true or false
            if not cp.running then
                profileFireSettingAutoDraw(cp, false)
                cp.inCycle   = false
                cp.lastRaidId= nil
            end
        end,
    })

    -- Register Priority profile elements with config
    AuraConfig:Register("PrWorlds",    prWorldsDropdown)
    AuraConfig:Register("PrGrades",    prGradesDropdown)
    AuraConfig:Register("PrUseRune",   prUseRuneToggle)
    AuraConfig:Register("PrRune",      prRuneDropdown)
    AuraConfig:Register("PrAutoArise", prAutoDrawToggle)
    AuraConfig:Register("PrAutoAura",  prAutoAuraToggle)
    AuraConfig:Register("PrStart",     prStartToggle)
end

----------------------------------------------------------------
-- Misc tab — config save / load + auto-load toggle
----------------------------------------------------------------
do
    local sec = tabMisc:Section({ Title = "Config", Opened = true })

    -- Auto-load toggle: persisted via config + getgenv flag
    local autoLoadToggle = sec:Toggle({
        Title    = "Auto Load Config",
        Desc     = "Load AuraKillv2 settings automatically on execute",
        Default  = autoLoadFlag,
        Callback = function(on)
            local enabled = on and true or false
            getgenv().AuraKill_AutoLoad = enabled
        end,
    })

    AuraConfig:Register("AutoLoadToggle", autoLoadToggle)

    -- Save / Load buttons
    sec:Button({
        Title    = "Save Config",
        Desc     = "Save current Aura / Challenge / Priority settings",
        Callback = function()
            pcall(function() AuraConfig:Save() end)
            WindUI:Notify({
                Title   = "Config",
                Content = "AuraKillv2 config saved.",
                Duration= 2,
            })
        end,
    })

    sec:Button({
        Title    = "Load Config",
        Desc     = "Load saved AuraKillv2 settings",
        Callback = function()
            pcall(function() AuraConfig:Load() end)
            WindUI:Notify({
                Title   = "Config",
                Content = "AuraKillv2 config loaded.",
                Duration= 2,
            })
        end,
    })
end

-- Auto-load once at startup if requested
if autoLoadFlag then
    pcall(function()
        AuraConfig:Load()
    end)
end

----------------------------------------------------------------
-- Extra tab — selective Extra (Arise / Destroy) filters
----------------------------------------------------------------
do
    local secE = tabExtra:Section({ Title = "Selective Extra", Opened = true })

    -- Build monster dropdown values from Monster config (unique base names)
    local monsterValues = {}
    do
        local seenBase = {}
        if type(MonsterConfig) == "table" then
            for _, m in ipairs(MonsterConfig) do
                local name = m.Name or m["Name"]
                if type(name) == "string" then
                    local base = name:gsub("%s*%[[^%]]+%]", "")
                    base = base:gsub("%s+$", "")
                    if base ~= "" and not seenBase[base] then
                        seenBase[base] = true
                        table.insert(monsterValues, base)
                    end
                end
            end
            table.sort(monsterValues)
        end
    end

    local EXTRA_GRADE_OPTIONS = { "All","E","D","C","B","A","S","SS","G","N","M" }

    local extraToggle = secE:Toggle({
        Title    = "Enable Selective Extra",
        Desc     = "Use selected monsters/grades when deciding ARISE vs DESTROY (UI only for now)",
        Default  = Extra_SelectEnabled,
        Callback = function(on)
            Extra_SelectEnabled = on and true or false
        end,
    })

    local monsterDropdown = secE:Dropdown({
        Title     = "Monsters",
        Desc      = "Base monsters eligible for ARISE (others can be DESTROYed)",
        Values    = (#monsterValues > 0) and monsterValues or { "None" },
        Value     = {},
        Multi     = true,
        AllowNone = true,
        Callback  = function(v)
            Extra_SelectedMonsterIds = {}
            local vals = (type(v) == "table") and v or { v }
            for _, txt in ipairs(vals) do
                local name = tostring(txt)
                if name ~= "" and name ~= "None" then
                    Extra_SelectedMonsterIds[name] = true
                end
            end
        end,
    })

    local gradeDropdown = secE:Dropdown({
        Title     = "Grades",
        Desc      = "Grades eligible for ARISE (empty = all grades)",
        Values    = EXTRA_GRADE_OPTIONS,
        Value     = { "All" },
        Multi     = true,
        AllowNone = false,
        Callback  = function(v)
            Extra_SelectedGrades = {}
            local vals   = (type(v)=="table") and v or {v}
            local useAll = false
            for _, s in ipairs(vals) do
                if tostring(s) == "All" then
                    useAll = true
                    break
                end
                if GRADE_INDEX[s] then
                    Extra_SelectedGrades[s] = true
                end
            end
            if useAll or next(Extra_SelectedGrades) == nil then
                Extra_SelectedGrades = {}
            end
        end,
    })

    AuraConfig:Register("ExtraToggle",   extraToggle)
    AuraConfig:Register("ExtraMonsters", monsterDropdown)
    AuraConfig:Register("ExtraGrades",   gradeDropdown)
end
