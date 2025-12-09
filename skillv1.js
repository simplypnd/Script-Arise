-- skill.lua
-- Simple GUI + wiring to test skill-related data

--------------------------------------------------------
-- Services / modules
--------------------------------------------------------
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()

-- Client PlayerManager you inspected earlier
local PlayerManager = require(ReplicatedStorage.Scripts.Client.Manager.PlayerManager)

--------------------------------------------------------
-- Wait for game / save data
--------------------------------------------------------
repeat
    task.wait()
until game:IsLoaded()
    and PlayerManager
    and PlayerManager.localPlayerData

--------------------------------------------------------
-- Helper: pick a UI parent (CoreGui if possible)
--------------------------------------------------------
local function getUiParent()
    local ok, coreGui = pcall(function()
        return game:GetService("CoreGui")
    end)
    if ok and coreGui then
        return coreGui
    end

    local pgui = LocalPlayer:FindFirstChildOfClass("PlayerGui")
        or LocalPlayer:WaitForChild("PlayerGui", 5)
    return pgui or workspace
end

--------------------------------------------------------
-- Build simple window
--------------------------------------------------------
local parent = getUiParent()

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "SkillTestGui"
screenGui.ResetOnSpawn = false
screenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
screenGui.Parent = parent

local frame = Instance.new("Frame")
frame.Name = "MainFrame"
frame.Size = UDim2.fromOffset(260, 150)
frame.Position = UDim2.fromScale(0.5, 0.5)
frame.AnchorPoint = Vector2.new(0.5, 0.5)
frame.BackgroundColor3 = Color3.fromRGB(20, 20, 26)
frame.BorderSizePixel = 0
frame.Parent = screenGui

local uiCorner = Instance.new("UICorner")
uiCorner.CornerRadius = UDim.new(0, 6)
uiCorner.Parent = frame

local titleBar = Instance.new("Frame")
titleBar.Name = "TitleBar"
titleBar.Size = UDim2.new(1, 0, 0, 28)
titleBar.BackgroundColor3 = Color3.fromRGB(35, 35, 45)
titleBar.BorderSizePixel = 0
titleBar.Parent = frame

local titleLabel = Instance.new("TextLabel")
titleLabel.Name = "Title"
titleLabel.Size = UDim2.new(1, -40, 1, 0)
titleLabel.Position = UDim2.new(0, 8, 0, 0)
titleLabel.BackgroundTransparency = 1
titleLabel.Font = Enum.Font.GothamBold
titleLabel.TextSize = 14
titleLabel.TextXAlignment = Enum.TextXAlignment.Left
titleLabel.TextColor3 = Color3.fromRGB(235, 235, 235)
titleLabel.Text = "Skill Test"
titleLabel.Parent = titleBar

local closeButton = Instance.new("TextButton")
closeButton.Name = "CloseButton"
closeButton.Size = UDim2.fromOffset(24, 24)
closeButton.Position = UDim2.new(1, -26, 0.5, -12)
closeButton.BackgroundColor3 = Color3.fromRGB(60, 60, 70)
closeButton.BorderSizePixel = 0
closeButton.Font = Enum.Font.GothamBold
closeButton.TextSize = 14
closeButton.TextColor3 = Color3.fromRGB(240, 240, 240)
closeButton.Text = "X"
closeButton.Parent = titleBar

local closeCorner = Instance.new("UICorner")
closeCorner.CornerRadius = UDim.new(1, 0)
closeCorner.Parent = closeButton

local testButton = Instance.new("TextButton")
testButton.Name = "TestButton"
testButton.Size = UDim2.fromOffset(120, 30)
testButton.Position = UDim2.new(0, 20, 0, 50)
testButton.BackgroundColor3 = Color3.fromRGB(70, 100, 190)
testButton.BorderSizePixel = 0
testButton.Font = Enum.Font.GothamBold
testButton.TextSize = 14
testButton.TextColor3 = Color3.fromRGB(240, 240, 240)
testButton.Text = "Test Skills"
testButton.Parent = frame

local testCorner = Instance.new("UICorner")
testCorner.CornerRadius = UDim.new(0, 4)
testCorner.Parent = testButton

local infoLabel = Instance.new("TextLabel")
infoLabel.Name = "Info"
infoLabel.Size = UDim2.new(1, -16, 0, 60)
infoLabel.Position = UDim2.new(0, 8, 0, 90)
infoLabel.BackgroundTransparency = 1
infoLabel.Font = Enum.Font.Gotham
infoLabel.TextSize = 13
infoLabel.TextWrapped = true
infoLabel.TextXAlignment = Enum.TextXAlignment.Left
infoLabel.TextYAlignment = Enum.TextYAlignment.Top
infoLabel.TextColor3 = Color3.fromRGB(220, 220, 220)
infoLabel.Text = "Click 'Test Skills' to print equipped hero GUIDs and current respiration attack skill ID to the output."
infoLabel.Parent = frame

--------------------------------------------------------
-- Close behaviour
--------------------------------------------------------
closeButton.MouseButton1Click:Connect(function()
    if screenGui then
        screenGui:Destroy()
    end
end)

--------------------------------------------------------
-- Simple drag behaviour
--------------------------------------------------------
local dragging = false
local dragStart
local startPos

local function updateDrag(input)
    local delta = input.Position - dragStart
    frame.Position = UDim2.new(
        startPos.X.Scale,
        startPos.X.Offset + delta.X,
        startPos.Y.Scale,
        startPos.Y.Offset + delta.Y
    )
end

titleBar.InputBegan:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1 then
        dragging = true
        dragStart = input.Position
        startPos = frame.Position
        input.Changed:Connect(function(state)
            if state == Enum.UserInputState.End then
                dragging = false
            end
        end)
    end
end)

titleBar.InputChanged:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseMovement and dragging then
        updateDrag(input)
    end
end)

--------------------------------------------------------
-- Test wiring: inspect heroes + respiration skills
--------------------------------------------------------
local function runSkillTest()
    local lpData = PlayerManager.localPlayerData
    if not lpData then
        warn("[SkillTest] localPlayerData not ready")
        return
    end

    -- Equipped heroes and their GUIDs
    if lpData.heros then
        warn("[SkillTest] Equipped heroes:")
        for heroGuid, heroData in pairs(lpData.heros) do
            if heroData and heroData.isEquip then
                warn(string.format("  heroGuid=%s id=%s level=%s grade=%s",
                    tostring(heroGuid),
                    tostring(heroData.id),
                    tostring(heroData.level),
                    tostring(heroData.grade)
                ))
            end
        end
    else
        warn("[SkillTest] lpData.heros is nil")
    end

    -- Respiration skills array
    local respSkills
    local ok1, err1 = pcall(function()
        respSkills = PlayerManager.GetCurrentRespirationSkillId()
    end)

    if ok1 and respSkills then
        warn("[SkillTest] Respiration skill IDs:", table.concat(respSkills, ", "))
    else
        warn("[SkillTest] GetCurrentRespirationSkillId failed:", err1)
    end

    -- Respiration attack skillId
    local haveRespAttack
    local ok2, err2 = pcall(function()
        haveRespAttack = PlayerManager.GetHaveRespirationAttack()
    end)

    if ok2 and haveRespAttack then
        warn("[SkillTest] Respiration attack skillId:", haveRespAttack)
    else
        warn("[SkillTest] GetHaveRespirationAttack failed or nil:", err2)
    end
end

testButton.MouseButton1Click:Connect(runSkillTest)
