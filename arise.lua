--// Combined: Auto City Raid Joiner + Return to Lobby + UI (with toggles)
-- Place this in StarterPlayerScripts

--============================================================
-- Services
--============================================================
local Players = game:GetService('Players')
local RunService = game:GetService('RunService')
local ReplicatedStorage = game:GetService('ReplicatedStorage')
local TweenService = game:GetService('TweenService')
local UserInputService = game:GetService('UserInputService')
local LocalPlayer = Players.LocalPlayer

--============================================================
-- Modules (game-specific)
--============================================================
local NotifyManager =
    require(ReplicatedStorage.Scripts.Share.Manager.NotifyManager)
local MapManager = require(ReplicatedStorage.Scripts.Client.Manager.MapManager)
local CityRaid =
    require(ReplicatedStorage.Scripts.Client.Manager.CityRaidManager)

--============================================================
-- Remotes
--============================================================
local Remotes = ReplicatedStorage:WaitForChild('Remotes')
local EvTeleport = Remotes:WaitForChild('StartLocalPlayerTeleport')
local EvEnterRaid = Remotes:WaitForChild('EnterCityRaidMap')    
local AttackRemote = Remotes:WaitForChild('PlayerClickAttackSkill')

--============================================================
-- Config (edit as needed)
--============================================================
local RAID_ID = 1000001
local HOST_MAP_ID = 50003
local LOBBY_MAP_ID = 50007 -- 👈 set this to your actual lobby map id
local RAID_DURATION = 600 -- from your config's EndIntervel

--============================================================
-- Helpers (shared)
--============================================================
local function now()
    return os.clock()
end

local function currentMapId()
    return MapManager.currentMapData
        and MapManager.currentMapData.mapSlotInfo
        and MapManager.currentMapData.mapSlotInfo.mapId
end

local function teleportTo(mapId)
    local ok, err = pcall(function()
        EvTeleport:FireServer({ mapId = mapId })
    end)
    if not ok then
        warn('[Teleport] failed:', err)
    else
        print('[Teleport] ->', mapId)
    end
end

local function waitForArrival(targetMapId, timeout)
    local t0 = now()
    while now() - t0 < (timeout or 25) do
        if currentMapId() == targetMapId then
            return true
        end
        RunService.Heartbeat:Wait()
    end
    return false
end

local function waitForRaidData(raidId, timeout)
    local t0 = now()
    timeout = timeout or 10
    while now() - t0 < timeout do
        if
            CityRaid
            and CityRaid.rankInfos
            and CityRaid.rankInfos[raidId] ~= nil
        then
            return true
        end
        RunService.Heartbeat:Wait()
    end
    return false
end

local function enterCityRaid(raidId)
    if not EvEnterRaid then
        return
    end
    waitForRaidData(raidId)
    local ok, err = pcall(function()
        EvEnterRaid:FireServer(raidId)
    end)
    if not ok then
        warn('[EnterRaid] Failed:', err)
    else
        print('[EnterRaid] Joined raid', raidId)
    end
end

--============================================================
-- UI
--============================================================
local ScreenGui = Instance.new('ScreenGui')
ScreenGui.Parent = LocalPlayer:WaitForChild('PlayerGui')
ScreenGui.ResetOnSpawn = false

local Frame = Instance.new('Frame')
Frame.Size = UDim2.new(0, 220, 0, 290)
Frame.Position = UDim2.new(0.4, 0, 0.3, 0)
Frame.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
Frame.Parent = ScreenGui
Frame.ClipsDescendants = true
Instance.new('UICorner', Frame).CornerRadius = UDim.new(0, 8)

-- Title bar
local TitleBar = Instance.new('Frame')
TitleBar.Size = UDim2.new(1, 0, 0, 25)
TitleBar.BackgroundColor3 = Color3.fromRGB(45, 45, 45)
TitleBar.BorderSizePixel = 0
TitleBar.Parent = Frame

local TitleText = Instance.new('TextLabel')
TitleText.Size = UDim2.new(1, -80, 1, 0)
TitleText.Position = UDim2.new(0, 10, 0, 0)
TitleText.BackgroundTransparency = 1
TitleText.Text = '⚙ Utilities'
TitleText.TextColor3 = Color3.fromRGB(255, 255, 255)
TitleText.Font = Enum.Font.SourceSansBold
TitleText.TextSize = 16
TitleText.TextXAlignment = Enum.TextXAlignment.Left
TitleText.Parent = TitleBar

-- Title buttons
local buttonSize, padding = 25, 5
local function createTitleButton(symbol, order)
    local btn = Instance.new('TextButton')
    btn.Size = UDim2.new(0, buttonSize, 1, 0)
    btn.Position = UDim2.new(1, -((buttonSize + padding) * order), 0, 0)
    btn.BackgroundTransparency = 1
    btn.Text = symbol
    btn.TextColor3 = Color3.fromRGB(255, 255, 255)
    btn.Font = Enum.Font.SourceSansBold
    btn.TextSize = 16
    btn.Parent = TitleBar
    return btn
end

local CloseButton = createTitleButton('X', 1)
local MinMaxButton = createTitleButton('–', 2)

-- Minimize / Maximize
local isMinimized = false
local originalSize = Frame.Size
local function minimize()
    if isMinimized then
        return
    end
    isMinimized = true
    MinMaxButton.Text = '□'
    TweenService
        :Create(Frame, TweenInfo.new(0.25, Enum.EasingStyle.Quad), {
            Size = UDim2.new(
                originalSize.X.Scale,
                originalSize.X.Offset,
                0,
                25
            ),
        })
        :Play()
end
local function maximize()
    if not isMinimized then
        return
    end
    isMinimized = false
    MinMaxButton.Text = '–'
    TweenService:Create(Frame, TweenInfo.new(0.25, Enum.EasingStyle.Quad), {
        Size = originalSize,
    }):Play()
end
MinMaxButton.MouseButton1Click:Connect(function()
    if isMinimized then
        maximize()
    else
        minimize()
    end
end)

-- Draggable
do
    local dragging, dragStart, startPos, inputConn
    local function update(input)
        local delta = input.Position - dragStart
        Frame.Position = UDim2.new(
            startPos.X.Scale,
            startPos.X.Offset + delta.X,
            startPos.Y.Scale,
            startPos.Y.Offset + delta.Y
        )
    end
    TitleBar.InputBegan:Connect(function(input)
        if
            input.UserInputType == Enum.UserInputType.MouseButton1
            or input.UserInputType == Enum.UserInputType.Touch
        then
            dragging = true
            dragStart = input.Position
            startPos = Frame.Position
            if inputConn then
                inputConn:Disconnect()
            end
            inputConn = input.Changed:Connect(function()
                if input.UserInputState == Enum.UserInputState.End then
                    dragging = false
                    if inputConn then
                        inputConn:Disconnect()
                        inputConn = nil
                    end
                end
            end)
        end
    end)
    UserInputService.InputChanged:Connect(function(input)
        if
            dragging
            and (
                input.UserInputType == Enum.UserInputType.MouseMovement
                or input.UserInputType == Enum.UserInputType.Touch
            )
        then
            update(input)
        end
    end)
end

--============================================================
-- Globals / State
--============================================================
_G.KillAuraEnabled = false
_G.HitboxSize = 999999999
_G.NPCFolder = workspace:FindFirstChild('Enemys')
_G.AttackEnemyGUID = 'f9dd63f1-fc6a-4860-bcc8-a65046a8ca4d'

local autoRaidEnabled = false
local raidEventConn: RBXScriptConnection? = nil
local watchdogThread: thread? = nil

--============================================================
-- Kill Aura
--============================================================
local attackThread
local function startAttackLoop()
    if attackThread then
        return
    end
    attackThread = task.spawn(function()
        while _G.KillAuraEnabled do
            pcall(function()
                AttackRemote:FireServer({ attackEnemyGUID = _G.AttackEnemyGUID })
            end)
            task.wait()
        end
        attackThread = nil
    end)
end

local function stopAttackLoop()
    _G.KillAuraEnabled = false
    -- attackThread will self-terminate on next loop tick
end

local function modifyNPCs()
    if not _G.NPCFolder then
        return
    end
    for _, npc in pairs(_G.NPCFolder:GetChildren()) do
        if npc:IsA('Model') and npc:FindFirstChild('HumanoidRootPart') then
            pcall(function()
                if _G.KillAuraEnabled then
                    npc.HumanoidRootPart.Size =
                        Vector3.new(_G.HitboxSize, _G.HitboxSize, _G.HitboxSize)
                    npc.HumanoidRootPart.CanCollide = false
                else
                    npc.HumanoidRootPart.Size = Vector3.new(2, 2, 1)
                    npc.HumanoidRootPart.CanCollide = true
                end
            end)
        end
    end
end
RunService.RenderStepped:Connect(function()
    pcall(modifyNPCs)
end)

--============================================================
-- Auto City Raid (toggleable)
--============================================================
local function onRaidUpdate(data)
    if not autoRaidEnabled or not data then
        return
    end

    -- Open
    if data.id == RAID_ID and data.action == 'OpenCityRaid' then
        print('[RaidWatcher] Raid opened. Teleporting to host map...')
        teleportTo(HOST_MAP_ID)
        if waitForArrival(HOST_MAP_ID, 15) then
            task.wait(2)
            enterCityRaid(RAID_ID)
        end
    end

    -- Close
    if
        data.id == RAID_ID
        and (
            data.action == 'CloseCityRaid'
            or data.state == 'End'
            or data.isOpen == 0
        )
    then
        print('[RaidWatcher] Raid closed. Returning to lobby...')
        teleportTo(LOBBY_MAP_ID)
    end
end

local function startRaidWatcher()
    if raidEventConn == nil then
        raidEventConn = NotifyManager.RegisterClientEvent(
            NotifyManager.EventData.UpdateCityRaidInfo,
            onRaidUpdate
        )
    end

    -- Watchdog thread (restarts each enable)
    if watchdogThread then
        task.cancel(watchdogThread)
    end
    watchdogThread = task.spawn(function()
        local t0 = now()
        while autoRaidEnabled and (now() - t0) < RAID_DURATION do
            RunService.Heartbeat:Wait()
        end
        if autoRaidEnabled and currentMapId() == HOST_MAP_ID then
            print(
                '[RaidWatcher] Watchdog: Raid duration expired. Teleporting to lobby...'
            )
            teleportTo(LOBBY_MAP_ID)
        end
    end)
end

local function stopRaidWatcher()
    autoRaidEnabled = false
    if watchdogThread then
        task.cancel(watchdogThread)
        watchdogThread = nil
    end
    -- keep the connection but it won't act while disabled (guarded by flag)
    -- if you prefer, uncomment to fully disconnect:
    -- if raidEventConn then raidEventConn:Disconnect(); raidEventConn = nil end
end

--============================================================
-- Button Factory
--============================================================
local function makeButton(text, yPos, callback)
    local btn = Instance.new('TextButton')
    btn.Size = UDim2.new(1, -20, 0, 40)
    btn.Position = UDim2.new(0, 10, 0, yPos)
    btn.BackgroundColor3 = Color3.fromRGB(50, 50, 50)
    btn.TextColor3 = Color3.fromRGB(255, 255, 255)
    btn.Font = Enum.Font.SourceSansBold
    btn.TextSize = 18
    btn.Text = text
    btn.Parent = Frame
    Instance.new('UICorner', btn).CornerRadius = UDim.new(0, 6)
    btn.MouseButton1Click:Connect(callback)
    return btn
end

--============================================================
-- Buttons
--============================================================
-- Kill Aura Toggle
local killAuraButton
killAuraButton = makeButton('Kill Aura: OFF', 35, function()
    _G.KillAuraEnabled = not _G.KillAuraEnabled
    if _G.KillAuraEnabled then
        killAuraButton.BackgroundColor3 = Color3.fromRGB(0, 170, 0)
        killAuraButton.Text = 'Kill Aura: ON'
        startAttackLoop()
    else
        killAuraButton.BackgroundColor3 = Color3.fromRGB(50, 50, 50)
        killAuraButton.Text = 'Kill Aura: OFF'
        stopAttackLoop()
    end
    print('Kill Aura:', _G.KillAuraEnabled and 'ON' or 'OFF')
end)

-- Auto City Raid Toggle
local raidButton
raidButton = makeButton('Auto City Raid: OFF', 85, function()
    autoRaidEnabled = not autoRaidEnabled
    if autoRaidEnabled then
        raidButton.BackgroundColor3 = Color3.fromRGB(0, 170, 0)
        raidButton.Text = 'Auto City Raid: ON'
        print('[RaidWatcher] Enabled.')
        startRaidWatcher()
    else
        raidButton.BackgroundColor3 = Color3.fromRGB(50, 50, 50)
        raidButton.Text = 'Auto City Raid: OFF'
        print('[RaidWatcher] Disabled.')
        stopRaidWatcher()
    end
end)

-- Optional: Quick Return to Lobby button
local lobbyButton
lobbyButton = makeButton('Return to Lobby', 135, function()
    teleportTo(LOBBY_MAP_ID)
end)

-- Optional: Quick Go Host Map button
local hostButton
hostButton = makeButton('Go Host Map', 185, function()
    teleportTo(HOST_MAP_ID)
end)

-- Spacer for future actions
makeButton('—', 235, function() end).Active = false

--============================================================
-- Close Button Cleanup
--============================================================
CloseButton.MouseButton1Click:Connect(function()
    -- disable features
    _G.KillAuraEnabled = false
    stopAttackLoop()

    if autoRaidEnabled then
        stopRaidWatcher()
    end
    -- If you decided to hard-disconnect the Notify connection, do it here as well:
    -- if raidEventConn then raidEventConn:Disconnect(); raidEventConn = nil end

    ScreenGui:Destroy()
    print('❌ UI closed.')
end)

print(
    '✅ Combined UI loaded: Kill Aura + Auto City Raid toggle + quick teleports.'
)
