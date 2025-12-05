-- RaidHunter.lua – normal raid hunter + rune + autodraw + kill aura

----------------------------------------------------------------
-- Services / modules
----------------------------------------------------------------
local Players           = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService        = game:GetService("RunService")
local LocalPlayer       = Players.LocalPlayer

local NotifyManager = require(ReplicatedStorage.Scripts.Share.Manager.NotifyManager)
local AgentManager  = require(ReplicatedStorage.Scripts.Share.Manager.AgentManager)
local RaidsManager  = require(ReplicatedStorage.Scripts.Client.Manager.RaidsManager)
local MAPS          = require(ReplicatedStorage.Scripts.Configs.Map)
local RaidsConfig   = require(ReplicatedStorage.Scripts.Configs.Raids)
local ItemConfig    = require(ReplicatedStorage.Scripts.Configs.Item)
local EnemyManager  = require(ReplicatedStorage.Scripts.Client.Manager.EnemyManager)

local Remotes       = ReplicatedStorage:WaitForChild("Remotes")
local R_CreateTeam  = Remotes:WaitForChild("CreateRaidTeam")
local R_StartRaid   = Remotes:WaitForChild("StartChallengeRaidMap")
local R_UseRaidItem = Remotes:WaitForChild("UseRaidItem")
local R_Setting     = Remotes:WaitForChild("Setting")
local AttackRemote  = Remotes:FindFirstChild("PlayerClickAttackSkill")

----------------------------------------------------------------
-- Config / UI state
----------------------------------------------------------------
local selectedRaidId      = nil
local useRuneEnabled      = false
local selectedRuneItemId  = nil
local autoDrawEnabled     = false
local running             = false

----------------------------------------------------------------
-- Helpers / state
----------------------------------------------------------------
local function now() return os.clock() end

local lastJoinTick   = 0
local inCycle        = false
local lastRaidId     = nil
local lastStartTime  = {}   -- [raidId] = os.clock() when StartChallengeRaidMap fired
local openRaidIds    = {}   -- [raidId] = true while announced open

-- Kill Aura (only active in raid; uses live enemyEntitys)
_G.RHKillAuraEnabled   = _G.RHKillAuraEnabled or false
_G.RHHitboxSize        = _G.RHHitboxSize or 2000

local killAuraThread

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
		if npc:IsA("Model") and npc:FindFirstChild("HumanoidRootPart") then
			pcall(function()
				npc.HumanoidRootPart.Size = Vector3.new(_G.RHHitboxSize, _G.RHHitboxSize, _G.RHHitboxSize)
				npc.HumanoidRootPart.CanCollide = false
			end)
		end
	end
end)

local function fireSettingAutoDraw(flag)
	if not autoDrawEnabled then return end
	local args = {
		{
			key   = "autoDraw",
			value = flag and true or false
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
	-- small delay so team is registered server-side
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

local function getCurrentRaidLevel()
	if RaidsManager and RaidsManager.raidsMapInfo then
		return RaidsManager.raidsMapInfo.currentLevel
	end
	return nil
end

-- Retry until raid closes, with 25s-from-start behavior
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

			-- Watchdog: give 10s to actually enter a raid
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
-- Raid announcements (open/close + auto-join)
----------------------------------------------------------------
NotifyManager.RegisterClientEvent(
	NotifyManager.EventData.UpdateRaidInfo,
	function(payload)
		if not payload or not payload.action then return end

		-- maintain open-set
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
		if not selectedRaidId then return end
		if inCycle then return end

		for _, info in pairs(payload.raidInfos) do
			if info.raidId == selectedRaidId then
				local t = now()
				if t - lastJoinTick < 5 then return end
				lastJoinTick = t
				inCycle      = true
				lastRaidId   = selectedRaidId
				createAndStartRaid(selectedRaidId)
				break
			end
		end
	end
)

----------------------------------------------------------------
-- Raid event hooks (enter / success / leave)
----------------------------------------------------------------
AgentManager.RegisterEvent(AgentManager.EventNames.EnterRaidsMap, function(_mapId)
	if not running then return end
	if not lastRaidId then return end

	fireSettingAutoDraw(true)

	_G.RHKillAuraEnabled = true
	startKillAura()
end)

AgentManager.RegisterEvent(AgentManager.EventNames.GainRaidsSuccessChest, function(_data)
	if not running then return end
	if not lastRaidId then return end

	fireSettingAutoDraw(false)
	_G.RHKillAuraEnabled = false

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
-- Simple UI
----------------------------------------------------------------
local playerGui = LocalPlayer:WaitForChild("PlayerGui")

local gui = Instance.new("ScreenGui")
gui.Name = "RaidHunterUI"
gui.ResetOnSpawn = false
gui.Parent = playerGui

local frame = Instance.new("Frame")
frame.Size = UDim2.new(0, 320, 0, 200)
frame.Position = UDim2.new(0, 20, 0, 140)
frame.BackgroundColor3 = Color3.fromRGB(20,20,20)
frame.BackgroundTransparency = 0.2
frame.BorderSizePixel = 0
frame.Parent = gui

local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, 0, 0, 28)
title.BackgroundTransparency = 1
title.Font = Enum.Font.SourceSansBold
title.TextColor3 = Color3.new(1,1,1)
title.TextScaled = true
title.Text = "Raid Hunter"
title.Parent = frame

local statusLabel = Instance.new("TextLabel")
statusLabel.Size = UDim2.new(1, -20, 0, 22)
statusLabel.Position = UDim2.new(0, 10, 0, 32)
statusLabel.BackgroundTransparency = 1
statusLabel.Font = Enum.Font.SourceSans
statusLabel.TextColor3 = Color3.new(1,1,1)
statusLabel.TextScaled = true
statusLabel.TextXAlignment = Enum.TextXAlignment.Left
statusLabel.Text = "Status: idle"
statusLabel.Parent = frame

----------------------------------------------------------------
-- Raid selection (cycle button)
----------------------------------------------------------------
local raidButton = Instance.new("TextButton")
raidButton.Size = UDim2.new(1, -20, 0, 24)
raidButton.Position = UDim2.new(0, 10, 0, 58)
raidButton.BackgroundColor3 = Color3.fromRGB(40,40,40)
raidButton.Font = Enum.Font.SourceSans
raidButton.TextColor3 = Color3.new(1,1,1)
raidButton.TextScaled = true
raidButton.Text = "Raid: (click to cycle)"
raidButton.Parent = frame

local raidDefs = {}
for _, cfg in ipairs(RaidsConfig) do
	if cfg.IsOpen == 1 and tonumber(cfg.Id) then
		table.insert(raidDefs, {
			id   = tonumber(cfg.Id),
			name = tostring(cfg.NameText or cfg.Id)
		})
	end
end
table.sort(raidDefs, function(a,b) return a.id < b.id end)

local raidIndex = 0
local function updateRaidButtonText()
	if selectedRaidId then
		local name = "(unknown)"
		for _, r in ipairs(raidDefs) do
			if r.id == selectedRaidId then
				name = r.name
				break
			end
		end
		raidButton.Text = "Raid: "..name.." ("..tostring(selectedRaidId)..")"
	else
		raidButton.Text = "Raid: (none)"
	end
end

raidButton.MouseButton1Click:Connect(function()
	if #raidDefs == 0 then return end
	raidIndex = raidIndex + 1
	if raidIndex > #raidDefs then raidIndex = 1 end
	selectedRaidId = raidDefs[raidIndex].id
	updateRaidButtonText()
end)

----------------------------------------------------------------
-- Rune list from Item config
----------------------------------------------------------------
local runeOptions = {}
do
	if type(ItemConfig) == "table" then
		for _, it in ipairs(ItemConfig) do
			local id   = it.Id or it["Id"]
			local name = it.Name or it["Name"]
			if id and name and tostring(name):find("Rune") then
				table.insert(runeOptions, { id = id, name = tostring(name) })
			end
		end
		table.sort(runeOptions, function(a,b) return a.id < b.id end)
	end
end
local runeIndex = 0

local runeToggle = Instance.new("TextButton")
runeToggle.Size = UDim2.new(0.5, -15, 0, 24)
runeToggle.Position = UDim2.new(0, 10, 0, 88)
runeToggle.BackgroundColor3 = Color3.fromRGB(40,40,40)
runeToggle.Font = Enum.Font.SourceSans
runeToggle.TextColor3 = Color3.new(1,1,1)
runeToggle.TextScaled = true
runeToggle.Text = "[ ] Use Rune"
runeToggle.Parent = frame

local runeButton = Instance.new("TextButton")
runeButton.Size = UDim2.new(0.5, -15, 0, 24)
runeButton.Position = UDim2.new(0.5, 5, 0, 88)
runeButton.BackgroundColor3 = Color3.fromRGB(40,40,40)
runeButton.Font = Enum.Font.SourceSans
runeButton.TextColor3 = Color3.new(1,1,1)
runeButton.TextScaled = true
runeButton.Text = "Rune: (cycle)"
runeButton.Parent = frame

local function updateRuneButtonText()
	if selectedRuneItemId then
		local name = "(unknown)"
		for _, r in ipairs(runeOptions) do
			if r.id == selectedRuneItemId then
				name = r.name
				break
			end
		end
		runeButton.Text = "Rune: "..name
	else
		runeButton.Text = "Rune: (none)"
	end
end

runeButton.MouseButton1Click:Connect(function()
	if #runeOptions == 0 then return end
	runeIndex = runeIndex + 1
	if runeIndex > #runeOptions then runeIndex = 1 end
	selectedRuneItemId = runeOptions[runeIndex].id
	updateRuneButtonText()
end)

runeToggle.MouseButton1Click:Connect(function()
	useRuneEnabled = not useRuneEnabled
	runeToggle.Text = (useRuneEnabled and "[x] Use Rune" or "[ ] Use Rune")
end)

----------------------------------------------------------------
-- Autodraw toggle
----------------------------------------------------------------
local drawToggle = Instance.new("TextButton")
drawToggle.Size = UDim2.new(1, -20, 0, 24)
drawToggle.Position = UDim2.new(0, 10, 0, 118)
drawToggle.BackgroundColor3 = Color3.fromRGB(40,40,40)
drawToggle.Font = Enum.Font.SourceSans
drawToggle.TextColor3 = Color3.new(1,1,1)
drawToggle.TextScaled = true
drawToggle.Text = "[ ] Autodraw/Arise"
drawToggle.Parent = frame

drawToggle.MouseButton1Click:Connect(function()
	autoDrawEnabled = not autoDrawEnabled
	drawToggle.Text = (autoDrawEnabled and "[x] Autodraw/Arise" or "[ ] Autodraw/Arise")
end)

----------------------------------------------------------------
-- Start / Stop
----------------------------------------------------------------
local startButton = Instance.new("TextButton")
startButton.Size = UDim2.new(1, -20, 0, 28)
startButton.Position = UDim2.new(0, 10, 0, 148)
startButton.BackgroundColor3 = Color3.fromRGB(60,60,60)
startButton.Font = Enum.Font.SourceSansBold
startButton.TextColor3 = Color3.new(1,1,1)
startButton.TextScaled = true
startButton.Text = "Start"
startButton.Parent = frame

local function updateStatus()
	statusLabel.Text = running and "Status: running" or "Status: idle"
	startButton.Text = running and "Stop" or "Start"
end

startButton.MouseButton1Click:Connect(function()
	running = not running
	if not running then
		fireSettingAutoDraw(false)
		_G.RHKillAuraEnabled = false
		inCycle      = false
		lastRaidId   = nil
	end
	updateStatus()
end)

updateRaidButtonText()
updateRuneButtonText()
updateStatus()
