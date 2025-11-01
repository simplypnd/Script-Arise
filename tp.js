--// Teleport to Enemy Tester (Dropdown + Close Button, safer scan)
--// Scans ONLY workspace.Enemys (with common fallbacks)

-------------------------------------------------------
-- Services
-------------------------------------------------------
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer

-------------------------------------------------------
-- Get/Wait for Enemys folder robustly
-------------------------------------------------------
local function getNPCFolder()
    local ws = workspace
    -- fast passes
    local f = ws:FindFirstChild("Enemys")
        or ws:FindFirstChild("Enemies")
        or ws:FindFirstChild("Enemy")
        or ws:FindFirstChild("NPCs")

    if f then
        return f
    end

    -- hard wait for exactly "Enemys"
    local ok, waited = pcall(function()
        return ws:WaitForChild("Enemys", 10)
    end)
    if ok and waited then
        return waited
    end

    return nil
end

local NPCFolder = getNPCFolder()

-------------------------------------------------------
-- Helpers
-------------------------------------------------------
local function getRoot()
    local char = LocalPlayer.Character or LocalPlayer.CharacterAdded:Wait()
    return char:WaitForChild("HumanoidRootPart")
end

local function getModelCF(model)
    if model:IsA("Model") then
        local cf, size = model:GetBoundingBox()
        return cf, size
    end
    return nil, nil
end

local function teleportAbove(cf, size, yPad)
    yPad = yPad or 4
    local y = (size and size.Y or 4) * 0.5 + yPad
    return cf * CFrame.new(0, y, 0)
end

local function teleportToEnemy(enemy)
    local root = getRoot()
    local cf, size = getModelCF(enemy)
    if not cf then
        return false
    end
    root.CFrame = teleportAbove(cf, size, 4)
    return true
end

local function getDistance(pos)
    local hrp = getRoot()
    return (hrp.Position - pos).Magnitude
end

local function collectEnemies()
    local list = {}
    if not NPCFolder then
        return list
    end

    for _, e in ipairs(NPCFolder:GetChildren()) do
        if e:IsA("Model") and e:FindFirstChild("HumanoidRootPart") then
            local hum = e:FindFirstChildOfClass("Humanoid")
            if hum and hum.Health > 0 then
                local d = getDistance(e.HumanoidRootPart.Position)
                table.insert(list, {
                    enemy = e,
                    label = string.format("%s [%.0f]", e.Name, d),
                    dist = d,
                })
            end
        end
    end

    -- sort nearest first
    table.sort(list, function(a, b)
        return a.dist < b.dist
    end)

    return list
end

-------------------------------------------------------
-- Simple Dropdown UI
-------------------------------------------------------
local parent = (gethui and gethui()) or game:GetService("CoreGui")

local gui = Instance.new("ScreenGui")
gui.Name = "TPEnemyDropdownUI"
gui.ResetOnSpawn = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = parent

local frame = Instance.new("Frame")
frame.Size = UDim2.fromOffset(280, 200)
frame.Position = UDim2.new(0.5, -140, 0.3, -90)
frame.BackgroundColor3 = Color3.fromRGB(30, 30, 40)
frame.Active = true
frame.Draggable = true
frame.ZIndex = 100
frame.Parent = gui
Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 10)

-- Title
local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, -10, 0, 26)
title.Position = UDim2.new(0, 5, 0, 5)
title.BackgroundTransparency = 1
title.Text = "Teleport to Enemy"
title.Font = Enum.Font.GothamBold
title.TextSize = 16
title.TextColor3 = Color3.fromRGB(230, 230, 240)
title.TextXAlignment = Enum.TextXAlignment.Left
title.ZIndex = 101
title.Parent = frame

-- Close Button
local closeBtn = Instance.new("TextButton")
closeBtn.Size = UDim2.new(0, 26, 0, 26)
closeBtn.Position = UDim2.new(1, -30, 0, 5)
closeBtn.BackgroundColor3 = Color3.fromRGB(170, 60, 60)
closeBtn.Text = "X"
closeBtn.Font = Enum.Font.GothamBold
closeBtn.TextSize = 16
closeBtn.TextColor3 = Color3.new(1, 1, 1)
closeBtn.AutoButtonColor = true
closeBtn.ZIndex = 101
closeBtn.Parent = frame
Instance.new("UICorner", closeBtn).CornerRadius = UDim.new(0, 6)

closeBtn.MouseButton1Click:Connect(function()
    gui:Destroy()
end)

-- Dropdown button (header)
local dropdown = Instance.new("TextButton")
dropdown.Size = UDim2.new(1, -20, 0, 30)
dropdown.Position = UDim2.new(0, 10, 0, 40)
dropdown.BackgroundColor3 = Color3.fromRGB(50, 50, 70)
dropdown.Font = Enum.Font.Gotham
dropdown.TextSize = 14
dropdown.TextColor3 = Color3.new(1, 1, 1)
dropdown.Text = "<Select Enemy>"
dropdown.AutoButtonColor = true
dropdown.ZIndex = 101
dropdown.Parent = frame
Instance.new("UICorner", dropdown).CornerRadius = UDim.new(0, 6)

-- Dropdown list
local listFrame = Instance.new("ScrollingFrame")
listFrame.Size = UDim2.new(1, -20, 0, 80)
listFrame.Position = UDim2.new(0, 10, 0, 75)
listFrame.Visible = false
listFrame.BackgroundColor3 = Color3.fromRGB(40, 40, 60)
listFrame.BorderSizePixel = 0
listFrame.ScrollBarThickness = 5
listFrame.CanvasSize = UDim2.new(0, 0, 0, 0)
listFrame.AutomaticCanvasSize = Enum.AutomaticSize.Y
listFrame.ZIndex = 200 -- above everything
listFrame.Parent = frame
Instance.new("UICorner", listFrame).CornerRadius = UDim.new(0, 6)

local listLayout = Instance.new("UIListLayout")
listLayout.Padding = UDim.new(0, 4)
listLayout.Parent = listFrame

-- Teleport button
local tpBtn = Instance.new("TextButton")
tpBtn.Size = UDim2.new(0.47, -5, 0, 30)
tpBtn.Position = UDim2.new(0.02, 0, 1, -40)
tpBtn.BackgroundColor3 = Color3.fromRGB(70, 130, 70)
tpBtn.Font = Enum.Font.GothamBold
tpBtn.TextSize = 14
tpBtn.TextColor3 = Color3.new(1, 1, 1)
tpBtn.Text = "Teleport"
tpBtn.AutoButtonColor = true
tpBtn.ZIndex = 101
tpBtn.Parent = frame
Instance.new("UICorner", tpBtn).CornerRadius = UDim.new(0, 6)

-- Refresh button
local refBtn = Instance.new("TextButton")
refBtn.Size = UDim2.new(0.47, -5, 0, 30)
refBtn.Position = UDim2.new(0.51, 0, 1, -40)
refBtn.BackgroundColor3 = Color3.fromRGB(90, 90, 140)
refBtn.Font = Enum.Font.GothamBold
refBtn.TextSize = 14
refBtn.TextColor3 = Color3.new(1, 1, 1)
refBtn.Text = "Refresh"
refBtn.AutoButtonColor = true
refBtn.ZIndex = 101
refBtn.Parent = frame
Instance.new("UICorner", refBtn).CornerRadius = UDim.new(0, 6)

-- Status label
local status = Instance.new("TextLabel")
status.Size = UDim2.new(1, -20, 0, 18)
status.Position = UDim2.new(0, 10, 1, -18)
status.BackgroundTransparency = 1
status.Font = Enum.Font.Gotham
status.TextSize = 13
status.TextColor3 = Color3.fromRGB(200, 200, 210)
status.Text = "Enemies: 0"
status.ZIndex = 101
status.Parent = frame

-------------------------------------------------------
-- Logic
-------------------------------------------------------
local selectedEnemy = nil
local enemies = {}

local function clearList()
    for _, child in ipairs(listFrame:GetChildren()) do
        if child:IsA("TextButton") then
            child:Destroy()
        end
    end
end

local function addItem(text, enemyModel)
    local btn = Instance.new("TextButton")
    btn.Size = UDim2.new(1, -6, 0, 24)
    btn.BackgroundColor3 = Color3.fromRGB(60, 60, 85)
    btn.TextColor3 = Color3.new(1, 1, 1)
    btn.Font = Enum.Font.Gotham
    btn.TextSize = 13
    btn.Text = text
    btn.AutoButtonColor = true
    btn.ZIndex = 201
    btn.Parent = listFrame
    Instance.new("UICorner", btn).CornerRadius = UDim.new(0, 4)

    btn.MouseButton1Click:Connect(function()
        selectedEnemy = enemyModel
        dropdown.Text = text
        listFrame.Visible = false
    end)
end

local function rebuildList()
    enemies = collectEnemies()
    clearList()

    if not NPCFolder then
        addItem("⚠️ Enemys folder not found", nil)
        status.Text = "Enemies: 0"
        return
    end

    if #enemies == 0 then
        addItem("No enemies found", nil)
        status.Text = "Enemies: 0"
        return
    end

    for _, data in ipairs(enemies) do
        addItem(data.label, data.enemy)
    end
    status.Text = "Enemies: " .. tostring(#enemies)
end

-- Show/hide + auto-refresh
dropdown.MouseButton1Click:Connect(function()
    if listFrame.Visible then
        listFrame.Visible = false
    else
        rebuildList()
        listFrame.Visible = true
    end
end)

-- Manual refresh
refBtn.MouseButton1Click:Connect(function()
    rebuildList()
end)

-- Teleport
tpBtn.MouseButton1Click:Connect(function()
    if selectedEnemy and selectedEnemy.Parent ~= nil then
        local ok = teleportToEnemy(selectedEnemy)
        status.Text = ok and "Teleported!" or "Failed to teleport."
    else
        status.Text = "No enemy selected or it despawned."
    end
end)

-------------------------------------------------------
-- Init
-------------------------------------------------------
rebuildList()
print("✅ Teleport-to-Enemy Dropdown UI loaded.")
