-- RaidHunter.lua – normal raid hunter + rune + autodraw + kill aura (WindUI)

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

do
    local raidsCfg = ConfigManager.GetConfig("Raids")
    if raidsCfg and type(raidsCfg.originalData) == "table" then
        RaidsConfigData = raidsCfg.originalData
    end

    local itemCfg = ConfigManager.GetConfig("Item")
    if itemCfg and type(itemCfg.originalData) == "table" then
        ItemConfigData = itemCfg.originalData
    end
end

----------------------------------------------------------------
-- State
----------------------------------------------------------------
local selectedRaidId      = nil
local useRuneEnabled      = false
local selectedRuneItemId  = nil
local autoDrawEnabled     = false
local running             = false

local function now() return os.clock() end

local lastJoinTick   = 0
local inCycle        = false
local lastRaidId     = nil
local lastStartTime  = {}   -- [raidId] = os.clock()
local openRaidIds    = {}   -- [raidId] = true while announced

-- Kill aura (only in raid)
_G.RHKillAuraEnabled   = _G.RHKillAuraEnabled or false
_G.RHEnemyGUID         = _G.RHEnemyGUID or "f9dd63f1-fc6a-4860-bcc8-a65046a8ca4d"
_G.RHHitboxSize        = _G.RHHitboxSize or 2000

local killAuraThread

local function startKillAura()
	if killAuraThread then return end
	killAuraThread = task.spawn(function()
		while _G.RHKillAuraEnabled do
			if AttackRemote and _G.RHEnemyGUID then
				pcall(function()
					AttackRemote:FireServer({ attackEnemyGUID = _G.RHEnemyGUID })
				end)
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
				npc.HumanoidRootPart.Size       = Vector3.new(_G.RHHitboxSize, _G.RHHitboxSize, _G.RHHitboxSize)
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
	task.wait(0.3)
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

-- Retry loop: 25s from start; repeat until raid closes
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

			-- Watchdog: 10s to enter raid
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
-- Raid events: enter / success / leave
----------------------------------------------------------------
AgentManager.RegisterEvent(AgentManager.EventNames.EnterRaidsMap, function(_mapId)
	if not running then return end
	if not lastRaidId then return end

	fireSettingAutoDraw(true)
	useSelectedRune()

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
-- Build dropdown lists
---------------------------------------------------------------
local raidDropdownValues = {}
local runeDropdownValues = {}

local function rebuildRaidList()
    raidDropdownValues = {}

    local tmp = {}
    if type(RaidsConfigData) == "table" then
        for _, cfg in ipairs(RaidsConfigData) do
            local id = cfg.Id or cfg["Id"]
            if cfg.IsOpen == 1 and tonumber(id) then
                table.insert(tmp, {
                    id   = tonumber(id),
                    name = tostring(cfg.NameText or id),
                })
            end
        end
    end

    table.sort(tmp, function(a,b) return a.id < b.id end)
    for _, r in ipairs(tmp) do
        table.insert(raidDropdownValues, ("%s (%d)"):format(r.name, r.id))
    end
end

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

rebuildRaidList()
rebuildRuneList()

---------------------------------------------------------------
-- Raid picker
---------------------------------------------------------------
sec:Dropdown({
    Title     = "Raid",
    Desc      = "Pick which normal raid to hunt",
    Values    = (#raidDropdownValues > 0) and raidDropdownValues or { "None" },
    Value     = (#raidDropdownValues > 0) and raidDropdownValues[1] or "None",
    Multi     = false,
    AllowNone = true,
    Callback  = function(v)
        local txt = (type(v)=="table") and v[1] or v
        if not txt or txt == "None" then
            selectedRaidId = nil
            return
        end
        local id = tonumber(txt:match("%((%d+)%)"))
        if not id then return end
        selectedRaidId = id
        WindUI:Notify({ Title="Raid Hunter", Content="Raid set to "..txt, Duration=2 })
    end,
})

sec:Button({
    Title    = "Refresh Raids",
    Desc     = "Rebuild list from ConfigManager Raids",
    Callback = function()
        rebuildRaidList()
        WindUI:Notify({ Title="Raid Hunter", Content="Raid list refreshed", Duration=2 })
    end
})

---------------------------------------------------------------
-- Rune usage
---------------------------------------------------------------
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
-- Start / Stop
---------------------------------------------------------------
sec:Toggle({
    Title    = "Start / Stop",
    Desc     = "Announcement → create team → start → 25s cooldown loop until raid closes",
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
    Desc  = "Pick a raid and optional rune. When that raid appears, the script makes a team, starts it, enables autodraw + kill aura, and after each success waits to satisfy the ~25s raid cooldown before retrying the same raid until it closes.",
})

Window:OnDestroy(function()
    running = false
    fireSettingAutoDraw(false)
    _G.RHKillAuraEnabled = false
end)
