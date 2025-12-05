-- AuraKill.lua — standalone Up5-style kill aura + hitbox slider

----------------------------------------------------------------
-- Services / modules
----------------------------------------------------------------
local Players           = game:GetService("Players")
local RunService        = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local LocalPlayer       = Players.LocalPlayer

local EnemyManager = require(ReplicatedStorage.Scripts.Client.Manager.EnemyManager)

local Remotes      = ReplicatedStorage:WaitForChild("Remotes")
local AttackRemote = Remotes:FindFirstChild("PlayerClickAttackSkill")

----------------------------------------------------------------
-- Global state (shared with Up5.lua conventions)
----------------------------------------------------------------
_G.KillAuraEnabled = _G.KillAuraEnabled or false
_G.HitboxSize      = _G.HitboxSize or 2
_G.NPCFolder       = workspace:FindFirstChild("Enemys")

----------------------------------------------------------------
-- Helpers
----------------------------------------------------------------
local function getCurrentRaidLevel()
    local RaidsManager = ReplicatedStorage.Scripts.Client.Manager:FindFirstChild("RaidsManager")
        and require(ReplicatedStorage.Scripts.Client.Manager.RaidsManager)

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
                -- If we’re in a raid with levels, respect that; otherwise just attack everything
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

-- Hitbox expansion (same semantics as Up5.lua)
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
-- Simple WindUI for toggling aura + hitbox
----------------------------------------------------------------
local WindUI = loadstring(game:HttpGet(
    "https://github.com/Footagesus/WindUI/releases/latest/download/main.lua"
))()

local parent = (gethui and gethui())
    or (pcall(function() return game:GetService("CoreGui") end) and game:GetService("CoreGui"))
    or LocalPlayer:WaitForChild("PlayerGui")
if WindUI.SetParent then WindUI:SetParent(parent) end

local Window = WindUI:CreateWindow({
    Title        = "AuraKill",
    Size         = UDim2.fromOffset(320, 180),
    Transparent  = true,
    Resizable    = true,
    SideBarWidth = 140,
})
Window:SetToggleKey(Enum.KeyCode.RightShift)
Window:Open()

local tabMain = Window:Tab({ Title="Aura", Icon="lucide:sparkles" })
local sec     = tabMain:Section({ Title="Kill Aura", Opened=true })

sec:Toggle({
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

sec:Slider({
    Title="Hitbox Size",
    Step = 1,
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

tabMain:Paragraph({
    Title = "Info",
    Desc  = "Up5-style kill aura: attacks EnemyManager.enemyEntitys and inflates hitboxes under workspace.Enemys while enabled.",
})

Window:OnDestroy(function()
    stopAttackLoop()
end)

