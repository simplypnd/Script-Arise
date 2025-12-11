-- Simple Potion Merge GUI (LocalScript)

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
frame.Size = UDim2.new(0, 260, 0, 130)
frame.Position = UDim2.new(0, 20, 0.5, -65)
frame.BackgroundColor3 = Color3.fromRGB(25, 25, 25)
frame.BorderSizePixel = 0
frame.Parent = screenGui

-- Title
local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, 0, 0, 30)
title.BackgroundTransparency = 1
title.Font = Enum.Font.SourceSansBold
title.TextSize = 20
title.TextColor3 = Color3.new(1, 1, 1)
title.Text = "Potion Merge"
title.Parent = frame

-- Potion ID box
local idBox = Instance.new("TextBox")
idBox.Size = UDim2.new(1, -20, 0, 25)
idBox.Position = UDim2.new(0, 10, 0, 40)
idBox.BackgroundColor3 = Color3.fromRGB(45, 45, 45)
idBox.BorderSizePixel = 0
idBox.Font = Enum.Font.SourceSans
idBox.TextSize = 18
idBox.TextColor3 = Color3.new(1, 1, 1)
idBox.PlaceholderText = "Potion ID (item id)"
idBox.Text = ""
idBox.Parent = frame

-- Count box
local countBox = Instance.new("TextBox")
countBox.Size = UDim2.new(1, -20, 0, 25)
countBox.Position = UDim2.new(0, 10, 0, 70)
countBox.BackgroundColor3 = Color3.fromRGB(45, 45, 45)
countBox.BorderSizePixel = 0
countBox.Font = Enum.Font.SourceSans
countBox.TextSize = 18
countBox.TextColor3 = Color3.new(1, 1, 1)
countBox.PlaceholderText = "Count to merge"
countBox.Text = ""
countBox.Parent = frame

-- Merge button
local mergeButton = Instance.new("TextButton")
mergeButton.Size = UDim2.new(0.5, -15, 0, 25)
mergeButton.Position = UDim2.new(0, 10, 0, 100)
mergeButton.BackgroundColor3 = Color3.fromRGB(0, 170, 255)
mergeButton.BorderSizePixel = 0
mergeButton.Font = Enum.Font.SourceSansBold
mergeButton.TextSize = 18
mergeButton.TextColor3 = Color3.new(1, 1, 1)
mergeButton.Text = "Merge"
mergeButton.Parent = frame

-- Status label
local statusLabel = Instance.new("TextLabel")
statusLabel.Size = UDim2.new(0.5, -15, 0, 25)
statusLabel.Position = UDim2.new(0.5, 5, 0, 100)
statusLabel.BackgroundTransparency = 1
statusLabel.Font = Enum.Font.SourceSans
statusLabel.TextSize = 16
statusLabel.TextColor3 = Color3.new(1, 1, 1)
statusLabel.Text = ""
statusLabel.Parent = frame

local function doMerge()
    local id = tonumber(idBox.Text)
    local count = tonumber(countBox.Text)

    if not id or not count or count <= 0 then
        statusLabel.Text = "Invalid id/count"
        return
    end

    statusLabel.Text = "Merging..."
    local ok, result = pcall(function()
        -- matches server-side: PotionMerge(p.id, p.count)
        return potionMergeRF:InvokeServer({
            id = id,
            count = count,
        })
    end)

    if not ok then
        statusLabel.Text = "Error: "..tostring(result)
    else
        -- result format depends on server implementation
        statusLabel.Text = "Done"
    end
end

mergeButton.MouseButton1Click:Connect(doMerge)
