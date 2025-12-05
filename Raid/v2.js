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
-- Helpers to (re)build raid / rune lists
---------------------------------------------------------------
local raidDropdownValues = {}
local runeDropdownValues = {}

local function rebuildRaidList()
    raidDropdownValues = {}

    local tmp = {}
    if type(RaidsConfig) == "table" then
        for _, cfg in ipairs(RaidsConfig) do
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

    if type(ItemConfig) ~= "table" then
        return
    end

    local tmp = {}
    for _, it in ipairs(ItemConfig) do
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
    Desc     = "Rebuild list from Configs.Raids",
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
