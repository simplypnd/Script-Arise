-- Simple Teleport GUI (LocalScript)

local Players = game:GetService("Players")
local TeleportService = game:GetService("TeleportService")

local player = Players.LocalPlayer

-- Create ScreenGui
local screenGui = Instance.new("ScreenGui")
screenGui.Name = "CustomTeleportGui"
screenGui.ResetOnSpawn = false
screenGui.Parent = player:WaitForChild("PlayerGui")

-- Create Frame
local frame = Instance.new("Frame")
frame.Size = UDim2.new(0, 300, 0, 120)
frame.Position = UDim2.new(0.5, -150, 0.5, -60)
frame.BackgroundColor3 = Color3.fromRGB(20, 20, 20)
frame.BorderSizePixel = 0
frame.Parent = screenGui

-- Title
local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, 0, 0, 30)
title.Position = UDim2.new(0, 0, 0, 0)
title.BackgroundTransparency = 1
title.Font = Enum.Font.SourceSansBold
title.TextSize = 20
title.TextColor3 = Color3.new(1, 1, 1)
title.Text = "Custom Teleport"
title.Parent = frame

-- TextBox for PlaceId
local placeBox = Instance.new("TextBox")
placeBox.Size = UDim2.new(1, -20, 0, 30)
placeBox.Position = UDim2.new(0, 10, 0, 40)
placeBox.BackgroundColor3 = Color3.fromRGB(40, 40, 40)
placeBox.BorderSizePixel = 0
placeBox.ClearTextOnFocus = false
placeBox.Font = Enum.Font.SourceSans
placeBox.TextSize = 18
placeBox.TextColor3 = Color3.new(1, 1, 1)
placeBox.PlaceholderText = "Enter PlaceId..."
placeBox.Text = ""
placeBox.Parent = frame

-- Teleport button
local button = Instance.new("TextButton")
button.Size = UDim2.new(0.5, -15, 0, 30)
button.Position = UDim2.new(0, 10, 0, 80)
button.BackgroundColor3 = Color3.fromRGB(0, 170, 255)
button.BorderSizePixel = 0
button.Font = Enum.Font.SourceSansBold
button.TextSize = 18
button.TextColor3 = Color3.new(1, 1, 1)
button.Text = "Teleport"
button.Parent = frame

-- Status label
local statusLabel = Instance.new("TextLabel")
statusLabel.Size = UDim2.new(0.5, -15, 0, 30)
statusLabel.Position = UDim2.new(0.5, 5, 0, 80)
statusLabel.BackgroundTransparency = 1
statusLabel.Font = Enum.Font.SourceSans
statusLabel.TextSize = 16
statusLabel.TextColor3 = Color3.new(1, 1, 1)
statusLabel.Text = ""
statusLabel.Parent = frame

local function teleportToTypedPlace()
    local text = placeBox.Text
    local placeId = tonumber(text)

    if not placeId then
        statusLabel.Text = "Invalid PlaceId"
        return
    end

    statusLabel.Text = "Teleporting..."
    button.AutoButtonColor = false
    button.Active = false

    -- Roblox permission rules still apply here
    TeleportService:Teleport(placeId, player)
end

button.MouseButton1Click:Connect(teleportToTypedPlace)

placeBox.FocusLost:Connect(function(enterPressed)
    if enterPressed then
        teleportToTypedPlace()
    end
end)
