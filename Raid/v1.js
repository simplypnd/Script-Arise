----------------------------------------------------------------
-- WindUI UI
----------------------------------------------------------------
local WindUI = loadstring(game:HttpGet(
    "https://github.com/Footagesus/WindUI/releases/latest/download/main.lua"
))()

-- Safe parent
local parent = (gethui and gethui())
    or (pcall(function() return game:GetService("CoreGui") end) and game:GetService("CoreGui"))
    or LocalPlayer:WaitForChild("PlayerGui")
if WindUI.SetParent then WindUI:SetParent(parent) end

local Window = WindUI:CreateWindow({
    Title       = "Raid Hunter",
    Size        = UDim2.fromOffset(420, 260),
    Transparent = true,
    Resizable   = true,
    SideBarWidth = 180,
})
Window:SetToggleKey(Enum.KeyCode.RightShift)
Window:Open()

local tabMain = Window:Tab({ Title = "Main", Icon = "lucide:sword" })

---------------------------------------------------------------
-- Build raid + rune lists for UI
---------------------------------------------------------------
local raidDefs = {}
for _, cfg in ipairs(RaidsConfig) do
    if cfg.IsOpen == 1 and tonumber(cfg.Id) then
        table.insert(raidDefs, {
            id   = tonumber(cfg.Id),
            name = tostring(cfg.NameText or cfg.Id),
        })
    end
end
table.sort(raidDefs, function(a,b) return a.id < b.id end)

local raidDropdownValues = {}
for _, r in ipairs(raidDefs) do
    table.insert(raidDropdownValues, ("%s (%d)"):format(r.name, r.id))
end

local runeOptions = {}
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

local runeDropdownValues = {}
for _, r in ipairs(runeOptions) do
    table.insert(runeDropdownValues, ("%s (%d)"):format(r.name, r.id))
end

---------------------------------------------------------------
-- Main section
---------------------------------------------------------------
local sec = tabMain:Section({ Title = "Raid Hunter", Opened = true })

-- Raid picker
sec:Dropdown({
    Title     = "Raid",
    Desc      = "Pick which normal raid to hunt",
    Values    = raidDropdownValues,
    Value     = raidDropdownValues[1],
    Multi     = false,
    AllowNone = false,
    Callback  = function(v)
        local txt = (type(v)=="table") and v[1] or v
        if not txt then return end
        local id = tonumber(txt:match("%((%d+)%)"))
        if not id then return end
        selectedRaidId = id
        WindUI:Notify({ Title="Raid Hunter", Content="Raid set to "..txt, Duration=2 })
    end,
})

-- Use rune toggle
sec:Toggle({
    Title    = "Use Rune",
    Desc     = "Send UseRaidItem when raid starts",
    Default  = useRuneEnabled,
    Callback = function(on)
        useRuneEnabled = on and true or false
    end,
})

-- Rune picker
sec:Dropdown({
    Title     = "Rune",
    Desc      = "Which rune item to use",
    Values    = runeDropdownValues,
    Value     = runeDropdownValues[1],
    Multi     = false,
    AllowNone = true,
    Callback  = function(v)
        local txt = (type(v)=="table") and v[1] or v
        if not txt then
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

-- Autodraw toggle
sec:Toggle({
    Title    = "Autodraw / Arise",
    Desc     = "Toggle Setting.autoDraw true/false inside raid",
    Default  = autoDrawEnabled,
    Callback = function(on)
        autoDrawEnabled = on and true or false
    end,
})

-- Start / Stop
sec:Toggle({
    Title    = "Start / Stop",
    Desc     = "Wait for raid announcement → create team → start → loop 25s cooldown",
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

-- About
tabMain:Paragraph({
    Title = "Flow",
    Desc  = "Pick a raid + rune (optional). When that raid appears, the script makes a team, starts it, enables autodraw & kill aura, and after success it respects a 25s cooldown (since start) and keeps retrying until the raid closes.",
})

Window:OnDestroy(function()
    running = false
    fireSettingAutoDraw(false)
    _G.RHKillAuraEnabled = false
end)
