-- Simple PotionMerge GUI (LocalScript)

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer
local remotes = ReplicatedStorage:WaitForChild("Remotes")
local potionMergeRF = remotes:WaitForChild("PotionMerge") -- RemoteFunction

-- ScreenGui
local screenGui = Instance.new("ScreenGui")
screenGui.Name = "PotionMergeGui"
screenGui.ResetOnSpawn = false
screenGui.Parent = player:WaitForChild("PlayerGui")

-- Frame
local frame = Instance.new("Frame")
frame.Size = UDim2.new(0, 280, 0, 160)
frame.Position = UDim2.new(0, 20, 0.5, -80)
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
title.Text = "Potion Merge"
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
    screenGui:Destroy()
end)

-- Potion ID box
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

-- Count box
local countBox = Instance.new("TextBox")
countBox.Size = UDim2.new(1, -20, 0, 25)
countBox.Position = UDim2.new(0, 10, 0, 70)
countBox.BackgroundColor3 = Color3.fromRGB(45, 45, 45)
countBox.BorderSizePixel = 0
countBox.Font = Enum.Font.SourceSans
countBox.TextSize = 16
countBox.TextColor3 = Color3.new(1, 1, 1)
countBox.PlaceholderText = "Count to merge (e.g. 5)"
countBox.Text = ""
countBox.Parent = frame

-- Status label
local statusLabel = Instance.new("TextLabel")
statusLabel.Size = UDim2.new(1, -20, 0, 20)
statusLabel.Position = UDim2.new(0, 10, 0, 100)
statusLabel.BackgroundTransparency = 1
statusLabel.Font = Enum.Font.SourceSans
statusLabel.TextSize = 14
statusLabel.TextColor3 = Color3.new(1, 1, 1)
statusLabel.Text = ""
statusLabel.TextXAlignment = Enum.TextXAlignment.Left
statusLabel.Parent = frame

-- Merge button
local mergeBtn = Instance.new("TextButton")
mergeBtn.Size = UDim2.new(0.5, -15, 0, 25)
mergeBtn.Position = UDim2.new(0, 10, 0, 120)
mergeBtn.BackgroundColor3 = Color3.fromRGB(0, 170, 255)
mergeBtn.BorderSizePixel = 0
mergeBtn.Font = Enum.Font.SourceSansBold
mergeBtn.TextSize = 16
mergeBtn.TextColor3 = Color3.new(1, 1, 1)
mergeBtn.Text = "Merge"
mergeBtn.Parent = frame

local function doMerge()
    local id = tonumber(idBox.Text)
    local count = tonumber(countBox.Text)

    if not id or not count or count <= 0 then
        statusLabel.Text = "Invalid id or count"
        return
    end

    statusLabel.Text = "Merging..."
    local ok, result = pcall(function()
        -- server expects { id = number, count = number }
        return potionMergeRF:InvokeServer({
            id = id,
            count = count,
        })
    end)

    if not ok then
        statusLabel.Text = "Error: " .. tostring(result)
    else
        -- result format depends on server-side PotionMerge
        statusLabel.Text = "Done"
    end
end

mergeBtn.MouseButton1Click:Connect(doMerge)
