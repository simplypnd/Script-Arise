local TeleportService = game:GetService("TeleportService")
local Players = game:GetService("Players")

local frame = script.Parent
local placeIdBox = frame:WaitForChild("PlaceIdBox")
local teleportButton = frame:WaitForChild("TeleportButton")

local player = Players.LocalPlayer

local function teleportToPlaceId()
    local text = placeIdBox.Text
    local placeId = tonumber(text)

    if not placeId then
        placeIdBox.Text = "Invalid PlaceId"
        return
    end

    -- Optional: clear UI feedback
    teleportButton.Text = "Teleporting..."
    teleportButton.AutoButtonColor = false

    -- Simple teleport – Roblox’s own access rules still apply
    TeleportService:Teleport(placeId, player)
end

teleportButton.MouseButton1Click:Connect(teleportToPlaceId)
placeIdBox.FocusLost:Connect(function(enterPressed)
    if enterPressed then
        teleportToPlaceId()
    end
end)
