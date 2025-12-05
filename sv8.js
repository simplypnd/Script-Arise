-- test.lua - CityRaid4 Kill Aura + Server Hop + Notify-based open/close

local Players           = game:GetService("Players")
local TeleportService   = game:GetService("TeleportService")
local HttpService       = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService        = game:GetService("RunService")
local LocalPlayer       = Players.LocalPlayer

local MapManager    = require(ReplicatedStorage.Scripts.Client.Manager.MapManager)
local CityRaid      = require(ReplicatedStorage.Scripts.Client.Manager.CityRaidManager)
local NotifyManager = require(ReplicatedStorage.Scripts.Share.Manager.NotifyManager)

local Remotes      = ReplicatedStorage:WaitForChild("Remotes")
local EvTeleport   = Remotes:WaitForChild("StartLocalPlayerTeleport")
local EvEnterRaid  = Remotes:WaitForChild("EnterCityRaidMap")
local AttackRemote = Remotes:FindFirstChild("PlayerClickAttackSkill")
local R_GetLastRankReward = Remotes:FindFirstChild("GetNewSingleTowerLastRankReward")
local R_EquipTeamHeros    = Remotes:FindFirstChild("EquipTeamHeros")

-- City Raid 4 (Monster Siege 4)
local CITY_RAID_ID  = 1000004
local HOST_MAP_ID   = 50013        -- Monster Siege 4 host map
local RAID_MAP_NAME = "Map204"     -- CityRaid map instance name

-- Kill Aura config
_G.CRAttackEnabled   = _G.CRAttackEnabled or false
_G.CRAttackEnemyGUID = "f9dd63f1-fc6a-4860-bcc8-a65046a8ca4d" -- specific GUID
_G.CRAttackHitbox    = 2000

----------------------------------------------------------------
-- Map / raid helpers
----------------------------------------------------------------

local function currentMapId()
	local mm = MapManager
	if mm and mm.currentMapData and mm.currentMapData.mapSlotInfo then
		return mm.currentMapData.mapSlotInfo.mapId
	end
	return nil
end

local function waitForArrival(targetMapId, timeout)
	local t0  = os.clock()
	local lim = timeout or 5
	while os.clock() - t0 < lim do
		if currentMapId() == targetMapId then
			return true
		end
		RunService.Heartbeat:Wait()
	end
	return false
end

local function isCityRaidOpenByManager(raidId)
	return CityRaid
	   and CityRaid.rankInfos
	   and CityRaid.rankInfos[raidId] ~= nil
end

local function isInCityRaidMap()
	local mapsFolder = workspace:FindFirstChild("Maps")
	return mapsFolder and mapsFolder:FindFirstChild(RAID_MAP_NAME) ~= nil
end

----------------------------------------------------------------
-- Notify-based CityRaid4 open/close tracking
----------------------------------------------------------------

local cityRaid4Open = false

NotifyManager.RegisterClientEvent(
	NotifyManager.EventData.UpdateCityRaidInfo,
	function(data)
		if not data or data.id ~= CITY_RAID_ID then return end

		if data.action == "OpenCityRaid" or data.isOpen == true or data.isOpen == 1 then
			cityRaid4Open = true
		elseif data.action == "CloseCityRaid" or data.isOpen == false or data.isOpen == 0 then
			cityRaid4Open = false
		end
	end
)

local function isCityRaid4Open()
	if cityRaid4Open then return true end
	return isCityRaidOpenByManager(CITY_RAID_ID)
end

----------------------------------------------------------------
-- Kill Aura (static GUID, big hitbox; only active in CityRaid)
----------------------------------------------------------------

local killAuraThread

local function startKillAura()
	if killAuraThread then return end
	killAuraThread = task.spawn(function()
		while _G.CRAttackEnabled do
			if AttackRemote and _G.CRAttackEnemyGUID then
				pcall(function()
					AttackRemote:FireServer({ attackEnemyGUID = _G.CRAttackEnemyGUID })
				end)
			end
			task.wait(0.1)
		end
		killAuraThread = nil
	end)
end

RunService.RenderStepped:Connect(function()
	if not _G.CRAttackEnabled then return end
	local enemysFolder = workspace:FindFirstChild("Enemys")
	if not enemysFolder then return end

	for _, npc in ipairs(enemysFolder:GetChildren()) do
		if npc:IsA("Model") and npc:FindFirstChild("HumanoidRootPart") then
			pcall(function()
				npc.HumanoidRootPart.Size = Vector3.new(_G.CRAttackHitbox, _G.CRAttackHitbox, _G.CRAttackHitbox)
				npc.HumanoidRootPart.CanCollide = false
			end)
		end
	end
end)

----------------------------------------------------------------
-- Server hop helpers
----------------------------------------------------------------

local function getRandomServerInstance()
	local placeId = game.PlaceId
	local servers = {}
	local cursor  = nil

	repeat
		local url = ("https://games.roblox.com/v1/games/%d/servers/Public?sortOrder=Desc&limit=100%s")
			:format(placeId, cursor and ("&cursor="..cursor) or "")
		local ok, result = pcall(function()
			return HttpService:JSONDecode(game:HttpGet(url))
		end)
		if not ok or not result or not result.data then break end

		for _, server in ipairs(result.data) do
			if type(server) == "table"
			   and server.playing < server.maxPlayers
			   and server.id ~= game.JobId then
				table.insert(servers, server)
			end
		end
		cursor = result.nextPageCursor
	until not cursor

	if #servers == 0 then return nil end
	return servers[math.random(1, #servers)]
end

local function hopToRandomServer()
	local server = getRandomServerInstance()
	if not server then
		warn("[ServerHop] No suitable server found.")
		return
	end
	TeleportService:TeleportToPlaceInstance(game.PlaceId, server.id, LocalPlayer)
end

----------------------------------------------------------------
-- Simple UI (status only)
----------------------------------------------------------------

local playerGui = LocalPlayer:WaitForChild("PlayerGui")

local gui = Instance.new("ScreenGui")
gui.Name = "CityRaidHopUI"
gui.ResetOnSpawn = false
gui.Parent = playerGui

local frame = Instance.new("Frame")
frame.Size = UDim2.new(0, 280, 0, 100)
frame.Position = UDim2.new(0, 20, 0, 80)
frame.BackgroundColor3 = Color3.fromRGB(20, 20, 20)
frame.BackgroundTransparency = 0.2
frame.BorderSizePixel = 0
frame.Parent = gui

local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, 0, 0, 28)
title.Position = UDim2.new(0, 0, 0, 0)
title.BackgroundTransparency = 1
title.Text = "CityRaid4 Hop + Kill Aura"
title.Font = Enum.Font.SourceSansBold
title.TextColor3 = Color3.new(1, 1, 1)
title.TextScaled = true
title.Parent = frame

local statusLabel = Instance.new("TextLabel")
statusLabel.Size = UDim2.new(1, -20, 0, 24)
statusLabel.Position = UDim2.new(0, 10, 0, 32)
statusLabel.BackgroundTransparency = 1
statusLabel.Font = Enum.Font.SourceSans
statusLabel.TextColor3 = Color3.new(1, 1, 1)
statusLabel.TextScaled = true
statusLabel.TextXAlignment = Enum.TextXAlignment.Left
statusLabel.Text = "Status: idle"
statusLabel.Parent = frame

local raidLabel = Instance.new("TextLabel")
raidLabel.Size = UDim2.new(1, -20, 0, 24)
raidLabel.Position = UDim2.new(0, 10, 0, 56)
raidLabel.BackgroundTransparency = 1
raidLabel.Font = Enum.Font.SourceSans
raidLabel.TextColor3 = Color3.new(1, 1, 1)
raidLabel.TextScaled = true
raidLabel.TextXAlignment = Enum.TextXAlignment.Left
raidLabel.Text = "CityRaid4: unknown"
raidLabel.Parent = frame

----------------------------------------------------------------
-- Main: host map → check open via Notify/Manager → join → kill aura → hop
----------------------------------------------------------------

task.spawn(function()
	statusLabel.Text = "Status: checking CityRaid4..."

	-- Step 1: Go to host map for CityRaid4 (with retries)
	local atHost = (currentMapId() == HOST_MAP_ID)
	if not atHost then
		-- Try to claim last rank reward before moving
		if R_GetLastRankReward then
			pcall(function()
				R_GetLastRankReward:FireServer()
			end)
		end

		for attempt = 1, 3 do
			statusLabel.Text = ("Status: tp host (try %d/3)"):format(attempt)
			pcall(function()
				EvTeleport:FireServer({ mapId = HOST_MAP_ID })
			end)
			if waitForArrival(HOST_MAP_ID, 15) then
				atHost = true
				break
			end
		end
	end

	if not atHost then
		raidLabel.Text   = "CityRaid4: host map failed (retry)"
		statusLabel.Text = "Status: Hopping"
		hopToRandomServer()
		return
	end

	-- After reaching host map, equip team 1
	if R_EquipTeamHeros then
		pcall(function()
			R_EquipTeamHeros:InvokeServer(1)
		end)
	end

	-- Step 2: Wait up to a few seconds for CityRaid info
	local t0, limit = os.clock(), 2
	while os.clock() - t0 < limit do
		if isCityRaid4Open() then break end
		RunService.Heartbeat:Wait()
	end

	if not isCityRaid4Open() then
		raidLabel.Text   = "CityRaid4: CLOSED"
		statusLabel.Text = "Status: Hopping"
		hopToRandomServer()
		return
	end

	-- Step 3: Join City Raid 4 (with retries)
	local joined = false
	for attempt = 1, 3 do
		raidLabel.Text   = ("CityRaid4: OPEN (join try %d/3)"):format(attempt)
		statusLabel.Text = "Status: joining raid"
		task.wait(1.5)

		pcall(function()
			EvEnterRaid:FireServer(CITY_RAID_ID)
		end)

		local joinDeadline = os.clock() + 5
		while os.clock() < joinDeadline do
			if isInCityRaidMap() then
				joined = true
				break
			end
			RunService.Heartbeat:Wait()
		end
		if joined then break end
	end

	if not joined or not isInCityRaidMap() then
		raidLabel.Text   = "CityRaid4: join failed (retry)"
		statusLabel.Text = "Status: Hopping"
		hopToRandomServer()
		return
	end

	raidLabel.Text   = "CityRaid4: IN RAID"
	statusLabel.Text = "Status: farming"
	-- Enable kill aura only inside city raid
	_G.CRAttackEnabled = true
	startKillAura()

	-- Step 4: Wait until we leave the CityRaid4 map (consider run finished)
	while isInCityRaidMap() do
		RunService.Heartbeat:Wait()
	end

	-- Disable kill aura and hop
	_G.CRAttackEnabled = false
	raidLabel.Text   = "CityRaid4: finished, hopping..."
	statusLabel.Text = "Status: hopping..."
	hopToRandomServer()
end)
