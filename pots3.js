-- Auto PotionMerge GUI with ID textbox (LocalScript)

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer
local remotes = ReplicatedStorage:WaitForChild("Remotes")
local potionMergeRF = remotes:WaitForChild("PotionMerge")

local DELAY_SECONDS = 0.2
local autoEnabled = false

-- ScreenGui
local screenGui = Instance.new("ScreenGui")
screenGui.Name = "AutoPotionMergeGui"
screenGui.ResetOnSpawn = false
screenGui.Parent = player:WaitForChild("PlayerGui")

-- Frame
local frame = Instance.new("Frame")
frame.Size = UDim2.new(0, 260, 0, 170)
frame.Position = UDim2.new(0, 20, 0.5, -85)
frame.BackgroundColor3 = Color3.fromRGB(25, 25, 25)
frame.BorderSizePixel = 0
frame.Parent = screenGui

-- Title
local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, -30, 0, 30)
title.Position = UDim2.new(0, 10, 0, 0)
title.BackgroundTransparency = 1
title.Font = Enum.Font.SourceSansBold
title.TextSize = 20
title.TextColor3 = Color3.new(1, 1, 1)
title.Text = "Auto Potion Merge"
title.TextXAlignment = Enum.TextXAlignment.Left
title.Parent = frame

-- Close button
local closeBtn = Instance.new("TextButton")
closeBtn.Size = UDim2.new(0, 24, 0, 24)
closeBtn.Position = UDim2.new(1, -28, 0, 3)
closeBtn.BackgroundColor3 = Color3.fromRGB(170, 0, 0)
closeBtn.BorderSizePixel = 0
closeBtn.Font = Enum.Font.SourceSansBold
closeBtn.TextSize = 16
closeBtn.TextColor3 = Color3.new(1, 1, 1)
closeBtn.Text = "X"
closeBtn.Parent = frame

closeBtn.MouseButton1Click:Connect(function()
    autoEnabled = false
    screenGui:Destroy()
end)

-- Potion ID textbox
local idBox = Instance.new("TextBox")
idBox.Size = UDim2.new(1, -20, 0, 25)
idBox.Position = UDim2.new(0, 10, 0, 40)
idBox.BackgroundColor3 = Color3.fromRGB(45, 45, 45)
idBox.BorderSizePixel = 0
idBox.Font = Enum.Font.SourceSans
idBox.TextSize = 16
idBox.TextColor3 = Color3.new(1, 1, 1)
idBox.PlaceholderText = "Potion item id (e.g. 10049)"
idBox.Text = ""
idBox.Parent = frame

-- Count textbox
local countBox = Instance.new("TextBox")
countBox.Size = UDim2.new(1, -20, 0, 25)
countBox.Position = UDim2.new(0, 10, 0, 70)
countBox.BackgroundColor3 = Color3.fromRGB(45, 45, 45)
countBox.BorderSizePixel = 0
countBox.Font = Enum.Font.SourceSans
countBox.TextSize = 16
countBox.TextColor3 = Color3.new(1, 1, 1)
countBox.PlaceholderText = "Count per merge (e.g. 5)"
countBox.Text = ""
countBox.Parent = frame

-- Toggle button
local toggleBtn = Instance.new("TextButton")
toggleBtn.Size = UDim2.new(1, -20, 0, 30)
toggleBtn.Position = UDim2.new(0, 10, 0, 100)
toggleBtn.BackgroundColor3 = Color3.fromRGB(0, 170, 255)
toggleBtn.BorderSizePixel = 0
toggleBtn.Font = Enum.Font.SourceSansBold
toggleBtn.TextSize = 18
toggleBtn.TextColor3 = Color3.new(1, 1, 1)
toggleBtn.Text = "Start Auto Merge"
toggleBtn.Parent = frame

-- Status label
local statusLabel = Instance.new("TextLabel")
statusLabel.Size = UDim2.new(1, -20, 0, 20)
statusLabel.Position = UDim2.new(0, 10, 0, 135)
statusLabel.BackgroundTransparency = 1
statusLabel.Font = Enum.Font.SourceSans
statusLabel.TextSize = 14
statusLabel.TextColor3 = Color3.new(1, 1, 1)
statusLabel.Text = "Idle"
statusLabel.TextXAlignment = Enum.TextXAlignment.Left
statusLabel.Parent = frame

local function updateButton()
    if autoEnabled then
        toggleBtn.Text = "Stop Auto Merge"
        toggleBtn.BackgroundColor3 = Color3.fromRGB(200, 80, 80)
        statusLabel.Text = "Running..."
    else
        toggleBtn.Text = "Start Auto Merge"
        toggleBtn.BackgroundColor3 = Color3.fromRGB(0, 170, 255)
        statusLabel.Text = "Idle"
    end
end

local function autoLoop(potionId, countPerMerge)
    while autoEnabled do
        local ok, result = pcall(function()
            return potionMergeRF:InvokeServer({
                id = potionId,
                count = countPerMerge,
            })
        end)

        if not ok then
            statusLabel.Text = "Error: " .. tostring(result)
            -- optional: stop on error
            -- autoEnabled = false
            -- updateButton()
            -- break
        end

        task.wait(DELAY_SECONDS)
    end
end

toggleBtn.MouseButton1Click:Connect(function()
    if not autoEnabled then
        local id = tonumber(idBox.Text)
        local count = tonumber(countBox.Text)

        if not id or not count or count <= 0 then
            statusLabel.Text = "Invalid id/count"
            return
        end

        autoEnabled = true
        updateButton()
        task.spawn(function()
            autoLoop(id, count)
        end)
    else
        autoEnabled = false
        updateButton()
    end
end)

updateButton()
