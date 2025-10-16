--// City & Challenge Raid Utilities — WindUI (announcement-driven, robust retry)
--// • Normal Raids: Wait announcement → pick lowest from selection → join.
--//   On loot: Quit → wait 30s → ALWAYS try SAME raid once → if we don't enter in 10s → idle for next announcement.
--// • City Raid mirrors test.lua.
--// • Kill Aura + Hitbox slider; Webhook; Lobby picker; Misc (focus restore).
--// • No AirWall logic.

----------------------------------------------------------------
-- Services
----------------------------------------------------------------
local Players           = game:GetService("Players")
local RunService        = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local HttpService       = game:GetService("HttpService")
local LocalPlayer       = Players.LocalPlayer

----------------------------------------------------------------
-- Game Modules
----------------------------------------------------------------
local NotifyManager = require(ReplicatedStorage.Scripts.Share.Manager.NotifyManager)
local AgentManager  = require(ReplicatedStorage.Scripts.Share.Manager.AgentManager)
local MapManager    = require(ReplicatedStorage.Scripts.Client.Manager.MapManager)
local CityRaid      = require(ReplicatedStorage.Scripts.Client.Manager.CityRaidManager)
local RaidsManager  = require(ReplicatedStorage.Scripts.Client.Manager.RaidsManager)
local RaidsConfig   = require(ReplicatedStorage.Scripts.Configs.Raids)
local MAPS          = require(ReplicatedStorage.Scripts.Configs.Map)

-- Build lookup for normal raid names (webhook text)
local RCFG_BY_ID = {}
if type(RaidsConfig) == "table" then
	for _, v in ipairs(RaidsConfig) do
		local id = tonumber(v.Id or v["Id"])
		if id then RCFG_BY_ID[id] = v end
	end
end

----------------------------------------------------------------
-- Remotes
----------------------------------------------------------------
local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local EvTeleport            = Remotes:WaitForChild("StartLocalPlayerTeleport") -- FireServer({ mapId = n })
local EvEnterRaid           = Remotes:WaitForChild("EnterCityRaidMap")         -- FireServer(raidId)
local AttackRemote          = Remotes:FindFirstChild("PlayerClickAttackSkill") -- optional farming
local CreateRaidTeam        = Remotes:FindFirstChild("CreateRaidTeam")         -- InvokeServer(raidId)
local StartChallengeRaidMap = Remotes:FindFirstChild("StartChallengeRaidMap")  -- FireServer()

----------------------------------------------------------------
-- Utils / State
----------------------------------------------------------------
local function now() return os.clock() end

_G.KillAuraEnabled = false
_G.HitboxSize      = 2
_G.NPCFolder       = workspace:FindFirstChild("Enemys")
_G.AttackEnemyGUID = "f9dd63f1-fc6a-4860-bcc8-a65046a8ca4d"

-- City Raid defs (same as test.lua)
local RAID_DEFS = {
	[1000001] = { id=1000001, name="Monster Siege 1", hostMapId=50003, duration=1800, mapName="Map201" },
	[1000002] = { id=1000002, name="Monster Siege 2", hostMapId=50007, duration=1800, mapName="Map202" },
	[1000003] = { id=1000003, name="Monster Siege 3", hostMapId=50010, duration=1800, mapName="Map203" },
}

local LOBBY_MAP_ID    = 50001
local autoRaidEnabled = { [1000001]=false, [1000002]=false, [1000003]=false }
local watchdogThreads = {}
local raidEventConn, raidGenericConn

----------------------------------------------------------------
-- Farming (Kill Aura)
----------------------------------------------------------------
local attackThread
local function startAttackLoop()
	if attackThread then return end
	attackThread = task.spawn(function()
		while _G.KillAuraEnabled do
			if AttackRemote then
				pcall(function()
					AttackRemote:FireServer({ attackEnemyGUID = _G.AttackEnemyGUID })
				end)
			end
			task.wait(0.1)
		end
		attackThread = nil
	end)
end
local function stopAttackLoop() _G.KillAuraEnabled = false end

RunService.RenderStepped:Connect(function()
	local folder = _G.NPCFolder
	if not folder then return end
	for _, npc in ipairs(folder:GetChildren()) do
		if npc:IsA("Model") and npc:FindFirstChild("HumanoidRootPart") then
			pcall(function()
				if _G.KillAuraEnabled then
					npc.HumanoidRootPart.Size = Vector3.new(_G.HitboxSize,_G.HitboxSize,_G.HitboxSize)
					npc.HumanoidRootPart.CanCollide = false
				else
					npc.HumanoidRootPart.Size = Vector3.new(2,2,1)
					npc.HumanoidRootPart.CanCollide = true
				end
			end)
		end
	end
end)

----------------------------------------------------------------
-- City Raid (test.lua sequence)
----------------------------------------------------------------
local function currentMapId()
	local mm = MapManager
	if mm and mm.currentMapData and mm.currentMapData.mapSlotInfo then
		return mm.currentMapData.mapSlotInfo.mapId
	end
	return nil
end

local function waitForArrival(targetMapId, timeout)
	local t0, limit = now(), (timeout or 15)
	while now() - t0 < limit do
		if currentMapId() == targetMapId then return true end
		RunService.Heartbeat:Wait()
	end
	return false
end

local function isInRaid(raidId)
	local def = RAID_DEFS[raidId]; if not def then return false end
	local maps = workspace:FindFirstChild("Maps")
	return maps and maps:FindFirstChild(def.mapName) ~= nil
end

local function waitForRaidData(raidId, timeout)
	local t0, limit = now(), (timeout or 6)
	while now() - t0 < limit do
		if CityRaid and CityRaid.rankInfos and CityRaid.rankInfos[raidId] ~= nil then
			return true
		end
		RunService.Heartbeat:Wait()
	end
	return false
end

local function teleportTo(mapId)
	pcall(function() EvTeleport:FireServer({ mapId = mapId }) end)
end

local function enterCityRaid(raidId)
	waitForRaidData(raidId, 6)
	if isInRaid(raidId) then return end
	pcall(function() EvEnterRaid:FireServer(raidId) end)
end

----------------------------------------------------------------
-- Webhook (normal raids only; combined embed)
----------------------------------------------------------------
local WEBHOOK_URL = ""
local WebhookEnabled = false

local function getHttpRequester()
	return (syn and syn.request)
		or (http and http.request)
		or (fluxus and fluxus.request)
		or http_request
		or request
end

local function sendDiscordWebhook(title, description, _, color)
	if not WebhookEnabled or WEBHOOK_URL == "" then return end
	local embeds = {{
		title = title or "Alert",
		description = description or "",
		color = color or 0x00AAFF,
		timestamp = DateTime.now():ToIsoDate(),
	}}
	local payload = { username = "Raid Alerts", embeds = embeds }
	local headers = { ["Content-Type"] = "application/json" }
	local body = HttpService:JSONEncode(payload)

	local req = getHttpRequester()
	if req then
		pcall(function() req({ Url = WEBHOOK_URL, Method = "POST", Headers = headers, Body = body }) end)
	else
		pcall(function() HttpService:PostAsync(WEBHOOK_URL, body, Enum.HttpContentType.ApplicationJson) end)
	end
end

----------------------------------------------------------------
-- City Raid + normal raids (webhook) event handlers
----------------------------------------------------------------
local function ensureRaidEvent()
	if not raidEventConn then
		raidEventConn = NotifyManager.RegisterClientEvent(
			NotifyManager.EventData.UpdateCityRaidInfo,
			function(data)
				if not data then return end
				local def = RAID_DEFS[data.id]
				if not def or not autoRaidEnabled[data.id] then return end

				if data.action == "OpenCityRaid" then
					if isInRaid(def.id) then return end
					teleportTo(def.hostMapId)
					if waitForArrival(def.hostMapId, 15) then
						task.wait(1.5)
						if not isInRaid(def.id) then
							enterCityRaid(def.id)
						end
					end
				end

				if data.action == "CloseCityRaid" or data.state == "End" or data.isOpen == false or data.isOpen == 0 then
					teleportTo(LOBBY_MAP_ID)
				end
			end
		)
	end

	if not raidGenericConn then
		raidGenericConn = NotifyManager.RegisterClientEvent(
			NotifyManager.EventData.UpdateRaidInfo,
			function(payload)
				if not payload or payload.action ~= "AddRaidEnters" or not payload.raidInfos then return end

				local raidList = {}
				for _, info in pairs(payload.raidInfos) do
					local raidId = info.raidId
					local cfg = RCFG_BY_ID[raidId]
					local raidName = (cfg and cfg.NameText) and tostring(cfg.NameText) or ("Raid "..tostring(raidId))
					table.insert(raidList, "**" .. raidName .. "**")
				end

				if #raidList > 0 and WebhookEnabled and WEBHOOK_URL ~= "" then
					local combinedText = table.concat(raidList, "\n")
					sendDiscordWebhook("🏹 Raid Appeared:", combinedText, nil, 0xFF8800)
				end
			end
		)
	end
end

local function startRaidWatchdog(raidId)
	local def = RAID_DEFS[raidId]; if not def then return end
	if watchdogThreads[raidId] then task.cancel(watchdogThreads[raidId]) end
	watchdogThreads[raidId] = task.spawn(function()
		local t0 = now()
		local dur = def.duration or 1800
		while autoRaidEnabled[raidId] and (now() - t0) < dur do RunService.Heartbeat:Wait() end
		if autoRaidEnabled[raidId] and currentMapId() == def.hostMapId then
			teleportTo(LOBBY_MAP_ID)
		end
	end)
end
local function stopRaidWatchdog(raidId)
	if watchdogThreads[raidId] then task.cancel(watchdogThreads[raidId]); watchdogThreads[raidId] = nil end
end
local function toggleRaid(raidId, enable)
	autoRaidEnabled[raidId] = enable and true or false
	if enable then
		ensureRaidEvent()
		startRaidWatchdog(raidId)
	else
		stopRaidWatchdog(raidId)
	end
end

----------------------------------------------------------------
-- Challenge/Normal Raid (announcement→lowest; loot→quit→wait→try same once; robust reset)
----------------------------------------------------------------

-- Grade mapping (Configs.Raids)
local GRADE_INDEX = { E=1, D=2, C=3, B=4, A=5, S=6, SS=7, G=8, N=9, M=10 }
local GRADE_ORDER = { "E","D","C","B","A","S","SS","G","N","M" }

-- Discover worlds + pretty names
local CR_WORLD_LIST, CR_WORLD_NAME = {}, {}
do
	-- Pretty names from MAPS (e.g., "1,Shadow Gate City")
	if type(MAPS) == "table" then
		for _, m in ipairs(MAPS) do
			local raw = m.MapName or m["MapName"]
			if type(raw) == "string" then
				local n, rest = raw:match("^(%d+)%s*,%s*(.+)$")
				if n then CR_WORLD_NAME[tonumber(n)] = rest end
			end
		end
	end

	-- Worlds seen in RaidsConfig (id = 930000 + (w-1)*10 + gradeIndex)
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
					table.insert(CR_WORLD_LIST, w)
				end
			end
		end
	end
	table.sort(CR_WORLD_LIST)
end

-- State
local CR_running            = false
local CR_selectedWorlds     = {}
local CR_selectedGrades     = {}
local CR_eventConn          = nil
local CR_busyForRaid        = {}   -- [raidId]=true while starting
local CR_lastJoinTick       = {}   -- anti-spam
local CR_lastCompletedRaidId= nil  -- last handled raid id
local CR_chestSpawnConn     = nil  -- ChallengeRaidsSuccess listener
local CR_openSet            = {}   -- [raidId] = true from latest AddRaidEnters
local CR_inCycle            = false
local CR_lootScheduled      = false

-- NEW: robust cycle tracking
local CR_activeTargetId     = nil
local CR_cycleSince         = 0
local function CR_resetCycle(_reason)
	CR_inCycle        = false
	CR_lootScheduled  = false
	CR_activeTargetId = nil
	CR_cycleSince     = 0
end

-- NEW: in-raid flag for quick checks
local CR_inRaidFlag = false
AgentManager.RegisterEvent(AgentManager.EventNames.EnterRaidsMap, function(_mapId)
	CR_inRaidFlag = true
end)
AgentManager.RegisterEvent(AgentManager.EventNames.LeaveRaidsMap, function(_mapId)
	CR_inRaidFlag = false
end)
local function CR_isInRaid()
	return CR_inRaidFlag or (RaidsManager and RaidsManager.raidsMapInfo ~= nil)
end

-- Hard-coded rejoin after loot (seconds)
local REJOIN_WAIT_SECS = 17

-- Helpers → ids / picking
local function CR_raidId(world, gradeLetter)
	local gi = GRADE_INDEX[gradeLetter]; if not gi then return nil end
	return 930000 + (world - 1) * 10 + gi
end
local function CR_buildSelectedRaidIdSet()
	local set = {}
	local grades = (#CR_selectedGrades==0) and GRADE_ORDER or CR_selectedGrades
	for _, w in ipairs(CR_selectedWorlds) do
		for _, g in ipairs(grades) do
			local id = CR_raidId(w, g)
			if id then set[id] = true end
		end
	end
	return set
end
local function CR_pickLowestOpenWanted()
	local lowest
	local wanted = CR_buildSelectedRaidIdSet()
	for rid, _ in pairs(CR_openSet) do
		if wanted[rid] then
			lowest = (not lowest or rid < lowest) and rid or lowest
		end
	end
	return lowest
end

-- Chest helpers
local function getModelCenterCF(modelLike)
	if modelLike:IsA("Model") then
		local cf, size = modelLike:GetBoundingBox()
		return cf, size
	elseif modelLike:IsA("BasePart") then
		return modelLike.CFrame, modelLike.Size
	else
		local parts = {}
		for _, d in ipairs(modelLike:GetDescendants()) do
			if d:IsA("BasePart") then table.insert(parts, d) end
		end
		if #parts > 0 then
			local minVec, maxVec
			for i, p in ipairs(parts) do
				local c = p.Position
				minVec = (i==1) and c or Vector3.new(math.min(minVec.X,c.X), math.min(minVec.Y,c.Y), math.min(minVec.Z,c.Z))
				maxVec = (i==1) and c or Vector3.new(math.max(maxVec.X,c.X), math.max(maxVec.Y,c.Y), math.max(maxVec.Z,c.Z))
			end
			local center = (minVec + maxVec)/2
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

local function CR_teleportToChestInside(chest)
	local char = Players.LocalPlayer.Character or Players.LocalPlayer.CharacterAdded:Wait()
	local root = char:WaitForChild("HumanoidRootPart")
	local hum  = char:FindFirstChildOfClass("Humanoid")
	if hum then hum.Sit = false; pcall(function() hum.PlatformStand = false end) end
	pcall(function() char.PrimaryPart.Anchored = false end)

	local cf, size = getModelCenterCF(chest)
	if not cf then return false end

	local target = placeAbove(cf, size, 4)
	local success = false
	for i=1,5 do
		root.CFrame = target
		task.wait(0.1 + i*0.05)
		if (root.Position - target.Position).Magnitude < 6 then success = true break end
	end
	if not success then
		target = placeInFront(cf, 7)
		for i=1,5 do
			root.CFrame = target
			task.wait(0.1 + i*0.05)
			if (root.Position - target.Position).Magnitude < 8 then success = true break end
		end
	end
	if success then root.CFrame = root.CFrame + Vector3.new(0,1.5,0) end
	return success
end

-- ▶ Event: chest spawned (success) + fallback quit if loot event missed
local function CR_listenChestSpawn()
	if CR_chestSpawnConn then return end
	CR_chestSpawnConn = NotifyManager.RegisterClientEvent(
		NotifyManager.EventData.ChallengeRaidsSuccess,
		function(_payload)
			CR_lootScheduled = false
			task.spawn(function()
				-- Try to find & TP to chest quickly
				local t0 = os.clock()
				local chest
				while os.clock() - t0 < 5 do
					chest = workspace:FindFirstChild("EnchantChest")
					if chest then break end
					task.wait(0.1)
				end
				if chest then
					CR_teleportToChestInside(chest)
				end

				-- Fallback (8s): if no loot-confirm scheduling happened, quit & reset cycle (idle)
				task.wait(8)
				if not CR_lootScheduled then
					pcall(function()
						if RaidsManager and RaidsManager.QuitRaidMap then
							RaidsManager.QuitRaidMap()
						end
					end)
					CR_resetCycle("fallback_quit_after_success")
				end
			end)
		end
	)
end

-- ▶ Start a specific raidId (single attempt)
local function CR_startOne(raidId)
	if CR_busyForRaid[raidId] then return end
	local nowt = os.clock()
	if (CR_lastJoinTick[raidId] or 0) > nowt - 5 then return end -- anti-spam

	CR_busyForRaid[raidId]  = true
	CR_lastJoinTick[raidId] = nowt
	CR_lastCompletedRaidId  = raidId

	-- mark cycle active
	CR_activeTargetId = raidId
	CR_cycleSince     = nowt
	CR_inCycle        = true

	task.spawn(function()
		if CreateRaidTeam then pcall(function() CreateRaidTeam:InvokeServer(raidId) end) end
		task.wait(0.25)
		if StartChallengeRaidMap then pcall(function() StartChallengeRaidMap:FireServer() end) end
		CR_busyForRaid[raidId] = nil
	end)
end

-- ▶ Listen for announcements; pick lowest when NOT in a cycle (+ recovery)
local CR_eventConn_ann = nil
local function CR_ensureEvent()
	if CR_eventConn_ann then return end
	CR_eventConn_ann = NotifyManager.RegisterClientEvent(
		NotifyManager.EventData.UpdateRaidInfo,
		function(payload)
			if not CR_running then return end
			if not payload or payload.action ~= "AddRaidEnters" or not payload.raidInfos then return end

			-- refresh open set
			CR_openSet = {}
			for _, info in pairs(payload.raidInfos) do
				local rid = info.raidId
				if rid then CR_openSet[rid] = true end
			end

			-- Recovery while "in cycle"
			if CR_inCycle then
				local stale = (CR_cycleSince > 0) and (os.clock() - CR_cycleSince > 120) -- 2 min safety
				local targetClosed = (CR_activeTargetId and not CR_openSet[CR_activeTargetId])
				local notInRaid = not CR_isInRaid()
				if stale or (targetClosed and notInRaid) then
					CR_resetCycle(stale and "stale_cycle" or "target_closed")
				end
			end

			-- Only start when NOT in a cycle
			if not CR_inCycle then
				local target = CR_pickLowestOpenWanted()
				if target then
					CR_startOne(target)
				end
			end
		end
	)
end

-- ▶ Loot confirmed → Quit → wait → ALWAYS try SAME raid once → watchdog checks entry
AgentManager.RegisterEvent(AgentManager.EventNames.GainRaidsSuccessChest, function(_data)
	local targetId = CR_lastCompletedRaidId
	if not targetId then return end
	CR_lootScheduled = true

	-- Quit current raid to host/lobby
	task.delay(1, function()
		pcall(function()
			if RaidsManager and RaidsManager.QuitRaidMap then
				RaidsManager.QuitRaidMap()
			end
		end)
	end)

	-- After the cooldown, attempt to re-create & enter the SAME raidId ONCE (regardless of openSet visibility)
	task.delay(20, function()
		if not CR_running then return end

		CR_startOne(targetId)

		-- Watchdog: if we don't actually enter a raid within N seconds, give up and idle.
		task.spawn(function()
			local deadline = os.clock() + 10  -- allow 10s to enter
			while os.clock() < deadline do
				if CR_isInRaid() then
					-- We're in a raid again: keep the cycle active.
					return
				end
				RunService.Heartbeat:Wait()
			end
			-- Didn't get in -> reset to idle (wait for next announcement)
			CR_resetCycle("retry_failed_no_entry")
		end)
	end)
end)

-- If you leave without loot scheduling, reset to idle
AgentManager.RegisterEvent(AgentManager.EventNames.LeaveRaidsMap, function(_mapId)
	if not CR_running then return end
	if CR_lootScheduled then return end
	CR_resetCycle("left_map")
end)

local function CR_start()
	if CR_running then return end
	if #CR_selectedWorlds == 0 then return end
	CR_running = true
	CR_resetCycle("start")
	CR_ensureEvent()
	CR_listenChestSpawn()
end
local function CR_stop()
	CR_running = false
	CR_resetCycle("stop")
end

----------------------------------------------------------------
-- WindUI
----------------------------------------------------------------
local WindUI = loadstring(game:HttpGet(
	"https://github.com/Footagesus/WindUI/releases/latest/download/main.lua"
))()

-- Safe parent (avoid plugin capability errors)
local parent = (gethui and gethui())
	or (pcall(function() return game:GetService("CoreGui") end) and game:GetService("CoreGui"))
	or game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")
if WindUI.SetParent then WindUI:SetParent(parent) end

local Window = WindUI:CreateWindow({
	Title = "City & Challenge Raid Utilities",
	Size  = UDim2.fromOffset(640,600),
	Transparent = true,
	Resizable = true,
	SideBarWidth = 220,
})
Window:SetToggleKey(Enum.KeyCode.RightShift)
Window:Open()

-- Tabs
local tabFarm      = Window:Tab({ Title="Farming",        Icon="lucide:sprout" })
local tabSiege     = Window:Tab({ Title="City Raid",      Icon="lucide:shield" })
local tabChallenge = Window:Tab({ Title="Challenge Raid", Icon="lucide:sword" })
local tabAlert     = Window:Tab({ Title="Alerts",         Icon="lucide:bell" })
local tabLobby     = Window:Tab({ Title="Lobby",          Icon="lucide:map" })
local tabMisc      = Window:Tab({ Title="Misc",           Icon="lucide:wrench" })
local tabAbout     = Window:Tab({ Title="About",          Icon="lucide:info" })

---------------------------------------------------------------
-- Farming Tab
---------------------------------------------------------------
do
	local sec = tabFarm:Section({ Title="Farming", Opened=true })
	sec:Toggle({
		Title="Kill Aura",
		Default=_G.KillAuraEnabled,
		Callback=function(on)
			_G.KillAuraEnabled = on
			if on then startAttackLoop() else stopAttackLoop() end
			WindUI:Notify({ Title="Kill Aura", Content=on and "Enabled" or "Disabled", Duration=2 })
		end
	})
	sec:Slider({
		Title="Hitbox Size",
		Step=1,
		Value={ Min=2, Max=2000, Default=_G.HitboxSize or 2 },
		Callback=function(v)
			_G.HitboxSize = v
			WindUI:Notify({ Title="Hitbox Size", Content="Set to "..v, Duration=1.5 })
		end
	})
end

---------------------------------------------------------------
-- City Raid Tab
---------------------------------------------------------------
do
	local sec = tabSiege:Section({ Title="Monster Siege", Opened=true })
	local raids = {}
	for _,def in pairs(RAID_DEFS) do table.insert(raids, def) end
	table.sort(raids, function(a,b) return a.id < b.id end)

	for _,def in ipairs(raids) do
		sec:Toggle({
			Title=def.name,
			Desc="Open→TP→15s→+1.5s→Enter • Close→Lobby",
			Default=false,
			Callback=function(state)
				toggleRaid(def.id, state)
				if state then ensureRaidEvent() end
			end
		})
	end
end

---------------------------------------------------------------
-- Challenge Raid Tab
---------------------------------------------------------------
do
	local sec = tabChallenge:Section({ Title="Join when open (Worlds × Grades)", Opened=true })

	-- Worlds
	local worldLabels = {}
	for _, w in ipairs(CR_WORLD_LIST) do
		local label = ("World %d%s"):format(w, CR_WORLD_NAME[w] and (" — "..CR_WORLD_NAME[w]) or "")
		table.insert(worldLabels, label)
	end
	sec:Dropdown({
		Title  = "Worlds",
		Values = worldLabels,
		Value  = {},
		Multi  = true,
		AllowNone = false,
		Callback = function(v)
			local vals  = (type(v)=="table") and v or {v}
			local chosen= {}
			for _, txt in ipairs(vals) do
				local n = tonumber(tostring(txt):match("World%s+(%d+)"))
				if n then table.insert(chosen, n) end
			end
			table.sort(chosen)
			CR_selectedWorlds = chosen
			if #CR_selectedWorlds > 0 then
				local pretty = {}
				for _, w in ipairs(CR_selectedWorlds) do
					table.insert(pretty, CR_WORLD_NAME[w] and (w.." ("..CR_WORLD_NAME[w]..")") or tostring(w))
				end
				WindUI:Notify({ Title="Challenge Raid", Content="Worlds: "..table.concat(pretty, ", "), Duration=2 })
			else
				WindUI:Notify({ Title="Challenge Raid", Content="Select at least one world.", Duration=2 })
			end
		end
	})

	-- Grades
	local GRADE_OPTIONS = { "All","E","D","C","B","A","S","SS","G","N","M" }
	sec:Dropdown({
		Title  = "Grades",
		Values = GRADE_OPTIONS,
		Value  = { "All" },
		Multi  = true,
		AllowNone = false,
		Callback = function(v)
			local vals = (type(v)=="table") and v or {v}
			local useAll, list = false, {}
			for _, s in ipairs(vals) do
				if tostring(s) == "All" then useAll = true break end
				if GRADE_INDEX[s] then table.insert(list, s) end
			end
			if useAll then
				CR_selectedGrades = {}
				WindUI:Notify({ Title="Challenge Raid", Content="Grades: All", Duration=2 })
			else
				CR_selectedGrades = list
				WindUI:Notify({ Title="Challenge Raid", Content="Grades: "..table.concat(list, ", "), Duration=2 })
			end
		end
	})

	sec:Toggle({
		Title="Start / Stop",
		Desc="Waits for announcement → picks lowest from selection → joins. On loot: Quit → wait → try SAME once; if fail → idle.",
		Default=false,
		Callback=function(on) if on then CR_start() else CR_stop() end end
	})
end

---------------------------------------------------------------
-- Alerts Tab
---------------------------------------------------------------
do
	local sec = tabAlert:Section({ Title="Alerts & Webhook", Opened=true })
	sec:Toggle({
		Title="Raid Webhook",
		Default=WebhookEnabled,
		Callback=function(on)
			WebhookEnabled = on
			if on then ensureRaidEvent() end
		end
	})
	sec:Input({
		Title="Webhook URL",
		Placeholder="https://discord.com/api/webhooks/...",
		Value=WEBHOOK_URL,
		Callback=function(v)
			WEBHOOK_URL = tostring(v or "")
			print("[Webhook] URL set to:", WEBHOOK_URL)
		end
	})
end

---------------------------------------------------------------
-- Lobby Tab
---------------------------------------------------------------
do
	local sec = tabLobby:Section({ Title="Lobby Map", Opened=true })

	local function parseMapName(raw)
		if type(raw) ~= "string" then return tostring(raw or "") end
		local comma = string.find(raw, ",")
		if comma then return (string.sub(raw, comma+1):gsub("^%s+", "")) end
		return raw
	end

	local values = {}
	if type(MAPS)=="table" then
		for _, entry in ipairs(MAPS) do
			local id, name, typ, open =
				entry.Id or entry["Id"],
				entry.MapName or entry["MapName"],
				entry.MapType or entry["MapType"],
				entry.IsOpen or entry["IsOpen"]
			if id and name and typ == 1 and open == 1 then
				table.insert(values, ("%s (Id %d)"):format(parseMapName(name), id))
			end
		end
	end
	table.sort(values)

	sec:Dropdown({
		Title="Select Lobby Map",
		Values=values,
		Value=values[1],
		Callback=function(v)
			local txt = (type(v)=="table") and v[1] or v
			if txt then
				local id = tonumber(txt:match("Id%s+(%d+)"))
				if id then
					LOBBY_MAP_ID = id
					WindUI:Notify({ Title="Lobby", Content=("Lobby set to %d"):format(id), Duration=2 })
				end
			end
		end
	})
	sec:Button({ Title="Teleport to Lobby", Callback=function() teleportTo(LOBBY_MAP_ID) end })
end

---------------------------------------------------------------
-- Misc Tab (Focus restore)
---------------------------------------------------------------
do
	local sec = tabMisc:Section({ Title = "Window Focus Fix", Opened = true })
	sec:Button({
		Title = "Enable Focus Restore",
		Desc  = "Re-enables game input if Roblox loses focus (firesignal patch)",
		Callback = function()
			assert(firesignal, "Your exploit does not support firesignal.")
			local UserInputService = game:GetService("UserInputService")
			local RunService       = game:GetService("RunService")
			if not _G.__FocusFixConnected then
				UserInputService.WindowFocusReleased:Connect(function()
					RunService.Stepped:Wait()
					pcall(firesignal, UserInputService.WindowFocused)
				end)
				_G.__FocusFixConnected = true
				WindUI:Notify({ Title="Misc", Content="Focus restore enabled ✅", Duration=3 })
			else
				WindUI:Notify({ Title="Misc", Content="Already active", Duration=2 })
			end
		end
	})
end

---------------------------------------------------------------
-- About Tab
---------------------------------------------------------------
tabAbout:Paragraph({
	Title="WindUI Integration",
	Desc="Normal raids: announcement-driven, lowest pick, one-shot same-raid retry after loot (else idle). City Raid mirrors test.lua. No AirWall."
})

Window:OnDestroy(function()
	_G.KillAuraEnabled = false
	stopAttackLoop()
	CR_stop()
end)
