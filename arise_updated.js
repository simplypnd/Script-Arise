--// Utilities: City Raid Auto-Join + Kill Aura + Sectioned UI + Fixed Lobby Dropdown
-- Place this LocalScript in StarterPlayerScripts

--============================================================
-- Services
--============================================================
local Players            = game:GetService('Players')
local RunService         = game:GetService('RunService')
local ReplicatedStorage  = game:GetService('ReplicatedStorage')
local TweenService       = game:GetService('TweenService')
local UserInputService   = game:GetService('UserInputService')
local LocalPlayer        = Players.LocalPlayer

--============================================================
-- Modules (game-specific)
--============================================================
local NotifyManager  = require(ReplicatedStorage.Scripts.Share.Manager.NotifyManager)
local MapManager     = require(ReplicatedStorage.Scripts.Client.Manager.MapManager)
local CityRaid       = require(ReplicatedStorage.Scripts.Client.Manager.CityRaidManager)

--============================================================
-- Remotes
--============================================================
local Remotes        = ReplicatedStorage:WaitForChild('Remotes')
local EvTeleport     = Remotes:WaitForChild('StartLocalPlayerTeleport')
local EvEnterRaid    = Remotes:WaitForChild('EnterCityRaidMap')
local AttackRemote   = Remotes:WaitForChild('PlayerClickAttackSkill')

--============================================================
-- Map Data (for Lobby dropdown) – uses your path
--============================================================
local MAP = require(game:GetService("ReplicatedStorage").Scripts.Configs.Map) -- your module returns an array
local MAPS = MAP

--============================================================
-- Config
--============================================================
local LOBBY_MAP_ID = 50002      -- default; updated by dropdown selection
local CITY_HUB_ID  = 50003      -- used internally for raid host teleports

-- City Raids
local RAID_DEFS = {
    [1000001] = { id=1000001, name="Monster Siege 1", hostMapId=50003, duration=1800, mapName="Map201" },
    [1000002] = { id=1000002, name="Monster Siege 2", hostMapId=50007, duration=1800, mapName="Map202" },
    [1000003] = { id=1000003, name="Monster Siege 3", hostMapId=50010, duration=1800, mapName="Map203" },
}

--============================================================
-- Helpers
--============================================================
local function now() return os.clock() end

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
    local limit = timeout or 25
    while now() - t0 < limit do
        if currentMapId() == targetMapId then
            return true
        end
        RunService.Heartbeat:Wait()
    end
    return false
end

-- Rank infos often need to populate; entering too early may be ignored
local function waitForRaidData(raidId, timeout)
    local t0 = now()
    local limit = timeout or 10
    while now() - t0 < limit do
        if CityRaid and CityRaid.rankInfos and CityRaid.rankInfos[raidId] ~= nil then
            return true
        end
        RunService.Heartbeat:Wait()
    end
    return false
end

local function isInRaid(raidId)
    local def = RAID_DEFS[raidId]; if not def then return false end
    local maps = workspace:FindFirstChild("Maps")
    return maps and maps:FindFirstChild(def.mapName) ~= nil
end

local lastJoinAttemptAt = {} -- anti-spam per raid
local function enterCityRaid(raidId)
    local def = RAID_DEFS[raidId]; if not def then return end
    -- throttle: 3s
    if lastJoinAttemptAt[raidId] and (now() - lastJoinAttemptAt[raidId] < 3) then
        return
    end
    lastJoinAttemptAt[raidId] = now()

    waitForRaidData(raidId, 6)
    if isInRaid(raidId) then
        print(('[EnterRaid] Already inside %s, skip.'):format(def.name))
        return
    end
    local ok, err = pcall(function()
        EvEnterRaid:FireServer(raidId)
    end)
    if not ok then
        warn('[EnterRaid] Failed:', err)
    else
        print('[EnterRaid] Fired for raid', raidId)
    end
end

--============================================================
-- UI (ScreenGui under PlayerGui)
--============================================================
local ScreenGui = Instance.new('ScreenGui')
ScreenGui.Parent = LocalPlayer:WaitForChild('PlayerGui')
ScreenGui.ResetOnSpawn = false

local Frame = Instance.new('Frame')
Frame.Size = UDim2.new(0, 260, 0, 370) -- tall enough for sections + dropdown
Frame.Position = UDim2.new(0.4, 0, 0.22, 0)
Frame.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
Frame.ClipsDescendants = false
Frame.Parent = ScreenGui
Instance.new('UICorner', Frame).CornerRadius = UDim.new(0, 8)

-- Title bar
local TitleBar = Instance.new('Frame')
TitleBar.Size = UDim2.new(1, 0, 0, 28)
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

-- Min/Max
local isMinimized = false
local originalSize = Frame.Size
local function minimize()
    if isMinimized then return end
    isMinimized = true
    MinMaxButton.Text = '□'
    TweenService:Create(Frame, TweenInfo.new(0.25, Enum.EasingStyle.Quad), {
        Size = UDim2.new(originalSize.X.Scale, originalSize.X.Offset, 0, 28),
    }):Play()
end
local function maximize()
    if not isMinimized then return end
    isMinimized = false
    MinMaxButton.Text = '–'
    TweenService:Create(Frame, TweenInfo.new(0.25, Enum.EasingStyle.Quad), {
        Size = originalSize,
    }):Play()
end
MinMaxButton.MouseButton1Click:Connect(function()
    if isMinimized then maximize() else minimize() end
end)

-- Draggable
do
    local dragging, dragStart, startPos, inputConn
    local function update(input)
        local delta = input.Position - dragStart
        Frame.Position = UDim2.new(
            startPos.X.Scale, startPos.X.Offset + delta.X,
            startPos.Y.Scale, startPos.Y.Offset + delta.Y
        )
    end
    TitleBar.InputBegan:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1
        or input.UserInputType == Enum.UserInputType.Touch then
            dragging = true
            dragStart = input.Position
            startPos = Frame.Position
            if inputConn then inputConn:Disconnect() end
            inputConn = input.Changed:Connect(function()
                if input.UserInputState == Enum.UserInputState.End then
                    dragging = false
                    if inputConn then inputConn:Disconnect(); inputConn=nil end
                end
            end)
        end
    end)
    UserInputService.InputChanged:Connect(function(input)
        if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement
        or input.UserInputType == Enum.UserInputType.Touch) then
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

local autoRaidEnabled = { [1000001]=false, [1000002]=false, [1000003]=false }
local raidEventConn = nil
local watchdogThreads = {}  -- [raidId] = thread

--============================================================
-- Kill Aura
--============================================================
local attackThread
local function startAttackLoop()
    if attackThread then return end
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
end

local function modifyNPCs()
    if not _G.NPCFolder then return end
    for _, npc in pairs(_G.NPCFolder:GetChildren()) do
        if npc:IsA('Model') and npc:FindFirstChild('HumanoidRootPart') then
            pcall(function()
                if _G.KillAuraEnabled then
                    npc.HumanoidRootPart.Size = Vector3.new(_G.HitboxSize, _G.HitboxSize, _G.HitboxSize)
                    npc.HumanoidRootPart.CanCollide = false
                else
                    npc.HumanoidRootPart.Size = Vector3.new(2,2,1)
                    npc.HumanoidRootPart.CanCollide = true
                end
            end)
        end
    end
end
RunService.RenderStepped:Connect(function() pcall(modifyNPCs) end)

--============================================================
-- City Raid watcher
--============================================================
local function ensureRaidEvent()
    if raidEventConn then return end
    raidEventConn = NotifyManager.RegisterClientEvent(
        NotifyManager.EventData.UpdateCityRaidInfo,
        function(data)
            if not data then return end
            local def = RAID_DEFS[data.id]
            if not def or not autoRaidEnabled[data.id] then return end

            -- Open event: host -> enter (if not already in Map201/202/203)
            if data.action == 'OpenCityRaid' then
                if isInRaid(def.id) then
                    print(('[RaidWatcher] Already inside %s — skip.'):format(def.name))
                    return
                end
                print(('[RaidWatcher] %s opened. Teleporting to host %d...'):format(def.name, def.hostMapId))
                teleportTo(def.hostMapId)
                if waitForArrival(def.hostMapId, 15) then
                    task.wait(1.5)
                    if not isInRaid(def.id) then
                        enterCityRaid(def.id)
                    else
                        print(('[RaidWatcher] Already inside %s after teleport.'):format(def.name))
                    end
                end
            end

            -- Close/End: go lobby
            if data.action == 'CloseCityRaid' or data.state == 'End' or data.isOpen == 0 then
                print(('[RaidWatcher] %s closed. Returning to lobby...'):format(def.name))
                teleportTo(LOBBY_MAP_ID)
            end
        end
    )
end

local function startRaidWatchdog(raidId)
    local def = RAID_DEFS[raidId]; if not def then return end
    if watchdogThreads[raidId] then task.cancel(watchdogThreads[raidId]) end
    watchdogThreads[raidId] = task.spawn(function()
        local t0 = now()
        local dur = def.duration or 1800
        while autoRaidEnabled[raidId] and (now() - t0) < dur do
            RunService.Heartbeat:Wait()
        end
        if autoRaidEnabled[raidId] and currentMapId() == def.hostMapId then
            print(('[RaidWatcher] %s watchdog expired. Teleporting to lobby...'):format(def.name))
            teleportTo(LOBBY_MAP_ID)
        end
    end)
end

local function stopRaidWatchdog(raidId)
    if watchdogThreads[raidId] then
        task.cancel(watchdogThreads[raidId])
        watchdogThreads[raidId] = nil
    end
end

--============================================================
-- UI factories
--============================================================
local function makeToggle(label, yPos, getState, setState, onClickExtra)
    local btn = Instance.new('TextButton')
    btn.Size = UDim2.new(1, -20, 0, 40)
    btn.Position = UDim2.new(0, 10, 0, yPos)
    btn.BackgroundColor3 = Color3.fromRGB(50, 50, 50)
    btn.TextColor3 = Color3.fromRGB(255, 255, 255)
    btn.Font = Enum.Font.SourceSansBold
    btn.TextSize = 18
    btn.Parent = Frame
    Instance.new('UICorner', btn).CornerRadius = UDim.new(0, 6)

    local function refresh()
        local on = getState()
        btn.Text = string.format("%s: %s", label, on and "ON" or "OFF")
        btn.BackgroundColor3 = on and Color3.fromRGB(0,170,0) or Color3.fromRGB(50,50,50)
    end

    btn.MouseButton1Click:Connect(function()
        local newState = not getState()
        setState(newState)
        if onClickExtra then onClickExtra(newState) end
        refresh()
    end)

    refresh()
    return btn
end

local function makeSection(title, yPos)
    local lbl = Instance.new("TextLabel")
    lbl.Size = UDim2.new(1, -20, 0, 18)
    lbl.Position = UDim2.new(0, 10, 0, yPos)
    lbl.BackgroundTransparency = 1
    lbl.TextXAlignment = Enum.TextXAlignment.Left
    lbl.Font = Enum.Font.SourceSansBold
    lbl.TextSize = 15
    lbl.TextColor3 = Color3.fromRGB(200,200,200)
    lbl.Text = title
    lbl.Parent = Frame
    return yPos + 22
end

local function makeDivider(yPos)
    local line = Instance.new("Frame")
    line.Size = UDim2.new(1, -20, 0, 1)
    line.Position = UDim2.new(0, 10, 0, yPos)
    line.BackgroundColor3 = Color3.fromRGB(80,80,80)
    line.BorderSizePixel = 0
    line.Parent = Frame
    return yPos + 10
end

--============================================================
-- Buttons / Toggles organized with sections
--============================================================
local function toggleRaid(raidId, enable)
    autoRaidEnabled[raidId] = enable
    local def = RAID_DEFS[raidId]
    if enable then
        print(("[RaidWatcher] %s enabled."):format(def.name))
        ensureRaidEvent()
        startRaidWatchdog(raidId)
    else
        print(("[RaidWatcher] %s disabled."):format(def.name))
        stopRaidWatchdog(raidId)
    end
end

local currentY = 35

-- Farming
currentY = makeSection("Farming", currentY)
makeToggle(
    "Kill Aura",
    currentY,
    function() return _G.KillAuraEnabled end,
    function(v) _G.KillAuraEnabled = v end,
    function(on)
        if on then startAttackLoop() else stopAttackLoop() end
        print("Kill Aura:", on and "ON" or "OFF")
    end
)
currentY = currentY + 50
currentY = makeDivider(currentY)

-- Siege
currentY = makeSection("Siege", currentY)
makeToggle(
    RAID_DEFS[1000001].name, currentY,
    function() return autoRaidEnabled[1000001] end,
    function(v) toggleRaid(1000001, v) end
)
currentY = currentY + 50
makeToggle(
    RAID_DEFS[1000002].name, currentY,
    function() return autoRaidEnabled[1000002] end,
    function(v) toggleRaid(1000002, v) end
)
currentY = currentY + 50
makeToggle(
    RAID_DEFS[1000003].name, currentY,
    function() return autoRaidEnabled[1000003] end,
    function(v) toggleRaid(1000003, v) end
)
currentY = currentY + 50
currentY = makeDivider(currentY)

--============================================================
-- Lobby Map (section label only; no extra label = no collision)
--============================================================
currentY = makeSection("Farm Map", currentY)

-- parse "N,Name" -> "Name"
local function parseMapName(raw)
    if type(raw) ~= "string" then return tostring(raw or "") end
    local comma = string.find(raw, ",")
    if comma then return (string.sub(raw, comma + 1):gsub("^%s+", "")) end
    return raw
end

-- build choices (MapType==1 and IsOpen==1)
local lobbyChoices = {}
for _, entry in ipairs(MAPS) do
    local mapId = entry.Id or entry["Id"]
    local mapName = entry.MapName or entry["MapName"]
    local mapType = entry.MapType or entry["MapType"]
    local isOpen  = entry.IsOpen or entry["IsOpen"]

    if mapId and mapName and (mapType == 1) and (isOpen == 1) then
        table.insert(lobbyChoices, { id = mapId, name = parseMapName(mapName) })
    end
end
table.sort(lobbyChoices, function(a,b) return a.id < b.id end)

-- dropdown button (sits directly under section header)
local baseY = currentY
local LobbyButton = Instance.new("TextButton")
LobbyButton.Size = UDim2.new(1, -20, 0, 36)
LobbyButton.Position = UDim2.new(0, 10, 0, baseY)
LobbyButton.BackgroundColor3 = Color3.fromRGB(50,50,50)
LobbyButton.TextColor3 = Color3.fromRGB(255,255,255)
LobbyButton.Font = Enum.Font.SourceSansBold
LobbyButton.TextSize = 18
LobbyButton.TextWrapped = false
LobbyButton.TextTruncate = Enum.TextTruncate.AtEnd
LobbyButton.Text = "Select lobby map…"
LobbyButton.Parent = Frame
Instance.new("UICorner", LobbyButton).CornerRadius = UDim.new(0,6)
LobbyButton.ZIndex = 15

currentY = currentY + 46 -- spacing for future elements

-- fixed dropdown (scrolling, auto-position, high z-index)
local DROPDOWN_MAX_HEIGHT = 220

local function setLobbySelection(item)
    LOBBY_MAP_ID = item.id
    LobbyButton.Text = ("%s"):format(item.name, item.id)
    if NotifyManager and NotifyManager.ShowTips then
        pcall(NotifyManager.ShowTips, ("Lobby map set to %s (Id %d)"):format(item.name, item.id))
    else
        print(("[Lobby] Set to %s (%d)"):format(item.name, item.id))
    end
end

local function positionDropdown(dropFrame, anchorBtn)
    local gui = ScreenGui
    local rootSize = gui.AbsoluteSize
    local btnAbsPos = anchorBtn.AbsolutePosition
    local btnAbsSize = anchorBtn.AbsoluteSize
    local frameAbsPos = Frame.AbsolutePosition

    dropFrame.Size = UDim2.new(1, -20, 0, DROPDOWN_MAX_HEIGHT)

    local localYBelow = (btnAbsPos.Y - frameAbsPos.Y) + btnAbsSize.Y + 4
    local localYAbove = (btnAbsPos.Y - frameAbsPos.Y) - DROPDOWN_MAX_HEIGHT - 4
    local spaceBelow = rootSize.Y - (btnAbsPos.Y + btnAbsSize.Y)
    local placeAbove = spaceBelow < (DROPDOWN_MAX_HEIGHT + 8)

    dropFrame.Position = UDim2.new(0, 10, 0, placeAbove and math.max(0, localYAbove) or localYBelow)
end

local DropFrame = Instance.new("Frame")
DropFrame.Size = UDim2.new(1, -20, 0, 140) -- temp; real height set by positionDropdown
DropFrame.Position = UDim2.new(0, 10, 0, baseY + 40)
DropFrame.BackgroundColor3 = Color3.fromRGB(40,40,40)
DropFrame.Visible = false
DropFrame.Parent = Frame
DropFrame.ZIndex = 50
Instance.new("UICorner", DropFrame).CornerRadius = UDim.new(0,6)

local Scroll = Instance.new("ScrollingFrame")
Scroll.Size = UDim2.new(1, -8, 1, -8)
Scroll.Position = UDim2.new(0, 4, 0, 4)
Scroll.ScrollBarThickness = 6
Scroll.ScrollingDirection = Enum.ScrollingDirection.Y
Scroll.ClipsDescendants = true
Scroll.BackgroundTransparency = 1
Scroll.AutomaticCanvasSize = Enum.AutomaticSize.None -- managed manually
Scroll.Parent = DropFrame
Scroll.ZIndex = 51

local UIList = Instance.new("UIListLayout")
UIList.Padding = UDim.new(0, 4)
UIList.SortOrder = Enum.SortOrder.LayoutOrder
UIList.Parent = Scroll

local function refreshCanvas()
    Scroll.CanvasSize = UDim2.new(0, 0, 0, UIList.AbsoluteContentSize.Y + 4)
end
UIList:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(refreshCanvas)

-- populate rows
for i, item in ipairs(lobbyChoices) do
    local row = Instance.new("TextButton")
    row.Size = UDim2.new(1, -8, 0, 28)
    row.BackgroundColor3 = Color3.fromRGB(55,55,55)
    row.TextColor3 = Color3.fromRGB(255,255,255)
    row.Font = Enum.Font.SourceSansBold
    row.TextSize = 16
    row.TextXAlignment = Enum.TextXAlignment.Left
    row.TextWrapped = false
    row.TextTruncate = Enum.TextTruncate.AtEnd
    row.Text = ("  %s  (Id %d)"):format(item.name, item.id)
    row.Parent = Scroll
    row.ZIndex = 52
    row.LayoutOrder = i
    Instance.new("UICorner", row).CornerRadius = UDim.new(0,4)

    row.MouseButton1Click:Connect(function()
        setLobbySelection(item)
        DropFrame.Visible = false
    end)
end
refreshCanvas()

LobbyButton.MouseButton1Click:Connect(function()
    DropFrame.Visible = not DropFrame.Visible
    if DropFrame.Visible then
        positionDropdown(DropFrame, LobbyButton)
        Scroll.CanvasPosition = Vector2.new(0, 0)
    end
end)

-- Reposition dropdown if screen size changes
ScreenGui:GetPropertyChangedSignal("AbsoluteSize"):Connect(function()
    if DropFrame.Visible then
        positionDropdown(DropFrame, LobbyButton)
    end
end)

-- Preselect current LOBBY_MAP_ID if present; otherwise default to first
do
    local picked
    for _, it in ipairs(lobbyChoices) do
        if it.id == LOBBY_MAP_ID then picked = it break end
    end
    if not picked then picked = lobbyChoices[1] end
    if picked then setLobbySelection(picked) end
end

--============================================================
-- Close Button Cleanup
--============================================================
CloseButton.MouseButton1Click:Connect(function()
    _G.KillAuraEnabled = false
    stopAttackLoop()
    for raidId,_ in pairs(autoRaidEnabled) do
        autoRaidEnabled[raidId] = false
        stopRaidWatchdog(raidId)
    end
    -- If you want to fully disconnect the event: if raidEventConn then raidEventConn:Disconnect(); raidEventConn=nil end
    ScreenGui:Destroy()
    print('❌ UI closed.')
end)

print('✅ Utilities loaded: Kill Aura + 3x Siege toggles + Lobby dropdown + dividers.')
