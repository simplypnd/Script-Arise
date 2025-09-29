-- Services
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")
local CoreGui = game:GetService("CoreGui")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

-- Create ScreenGui
local ScreenGui = Instance.new("ScreenGui")
ScreenGui.Parent = LocalPlayer:WaitForChild("PlayerGui")
ScreenGui.ResetOnSpawn = false

-- Variables for drag control
local dragging
local dragInput
local dragStart
local startPos

-- Main window
local Frame = Instance.new("Frame")
Frame.Size = UDim2.new(0, 250, 0, 250) -- Increased initial size
Frame.Position = UDim2.new(0.35, 0, 0.3, 0)
Frame.BackgroundColor3 = Color3.fromRGB(20, 20, 20)
Frame.BorderSizePixel = 0
Frame.Parent = ScreenGui
Instance.new("UICorner", Frame).CornerRadius = UDim.new(0, 8)

-- Title bar (for dragging)
local TitleBar = Instance.new("Frame")
TitleBar.Size = UDim2.new(1, 0, 0, 30)
TitleBar.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
TitleBar.BorderSizePixel = 0
TitleBar.Parent = Frame
Instance.new("UICorner", TitleBar).CornerRadius = UDim.new(0, 8)

-- Centered title
local Titulo = Instance.new("TextLabel")
Titulo.Size = UDim2.new(0.8, 0, 1, 0)
Titulo.Position = UDim2.new(0.1, 0, 0, 0)
Titulo.BackgroundTransparency = 1
Titulo.Text = "RN TEAM"
Titulo.TextColor3 = Color3.fromRGB(255, 255, 255)
Titulo.Font = Enum.Font.SourceSansBold
Titulo.TextSize = 16
Titulo.TextXAlignment = Enum.TextXAlignment.Center
Titulo.Parent = TitleBar

-- Minimize button
local MinimizeButton = Instance.new("TextButton")
MinimizeButton.Size = UDim2.new(0, 30, 0, 30)
MinimizeButton.Position = UDim2.new(1, -30, 0, 0)
MinimizeButton.BackgroundTransparency = 1
MinimizeButton.Text = "-"
MinimizeButton.TextColor3 = Color3.fromRGB(255, 255, 255)
MinimizeButton.Font = Enum.Font.SourceSansBold
MinimizeButton.TextSize = 20
MinimizeButton.Parent = TitleBar

-- Content container WITH SCROLLING (scrollbar invisible)
local ContentContainer = Instance.new("ScrollingFrame")
ContentContainer.Size = UDim2.new(1, -10, 1, -60)
ContentContainer.Position = UDim2.new(0, 5, 0, 35)
ContentContainer.BackgroundTransparency = 1
ContentContainer.BorderSizePixel = 0
ContentContainer.ScrollBarThickness = 0 -- Invisible scrollbar
ContentContainer.ScrollBarImageColor3 = Color3.fromRGB(0, 0, 0)
ContentContainer.ScrollBarImageTransparency = 1
ContentContainer.ClipsDescendants = true
ContentContainer.Parent = Frame

-- Layout to organize elements
local UIListLayout = Instance.new("UIListLayout")
UIListLayout.Padding = UDim.new(0, 10)
UIListLayout.Parent = ContentContainer

-- Fixed text at the bottom (credits)
local Creditos = Instance.new("TextLabel")
Creditos.Size = UDim2.new(1, 0, 0, 30)
Creditos.Position = UDim2.new(0, 0, 1, -30)
Creditos.BackgroundTransparency = 1
Creditos.Text = "YouTube: RN_TEAM"
Creditos.TextColor3 = Color3.fromRGB(200, 200, 200)
Creditos.Font = Enum.Font.SourceSansBold
Creditos.TextSize = 16
Creditos.Parent = Frame

-- Background frame to allow dragging over the whole UI
local BackgroundDrag = Instance.new("Frame")
BackgroundDrag.Size = UDim2.new(1, 0, 1, 0)
BackgroundDrag.BackgroundTransparency = 1
BackgroundDrag.BorderSizePixel = 0
BackgroundDrag.ZIndex = 0
BackgroundDrag.Parent = Frame

-- Drag function
local function update(input)
	local delta = input.Position - dragStart
	Frame.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)
end

-- Connect drag events to title bar and background
local function connectDragEvents(frame)
	frame.InputBegan:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
			dragging = true
			dragStart = input.Position
			startPos = Frame.Position
			
			input.Changed:Connect(function()
				if input.UserInputState == Enum.UserInputState.End then
					dragging = false
				end
			end)
		end
	end)

	frame.InputChanged:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch then
			dragInput = input
		end
	end)
end

connectDragEvents(TitleBar)
connectDragEvents(BackgroundDrag)

UserInputService.InputChanged:Connect(function(input)
	if input == dragInput and dragging then
		update(input)
	end
end)

-- Function to auto-adjust window height
local function adjustWindowHeight()
    local minHeight = 250
    local maxHeight = 450
    local contentHeight = UIListLayout.AbsoluteContentSize.Y + 80
    
    local newHeight = math.clamp(contentHeight, minHeight, maxHeight)
    
    local tween = TweenService:Create(
        Frame,
        TweenInfo.new(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
        {Size = UDim2.new(0, 250, 0, newHeight)}
    )
    tween:Play()
    
    ContentContainer.CanvasSize = UDim2.new(0, 0, 0, UIListLayout.AbsoluteContentSize.Y)
end

-- Minimize/maximize
local isMinimized = false
local originalSize = Frame.Size
local minimizedSize = UDim2.new(0, 250, 0, 30)

MinimizeButton.MouseButton1Click:Connect(function()
	isMinimized = not isMinimized
	
	if isMinimized then
		local tween = TweenService:Create(Frame, TweenInfo.new(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {Size = minimizedSize})
		tween:Play()
		ContentContainer.Visible = false
		Creditos.Visible = false
		BackgroundDrag.Visible = false
		MinimizeButton.Text = "+"
	else
		local tween = TweenService:Create(Frame, TweenInfo.new(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {Size = originalSize})
		tween:Play()
		ContentContainer.Visible = true
		Creditos.Visible = true
		BackgroundDrag.Visible = true
		MinimizeButton.Text = "-"
	end
end)

-- Button style: bar
local function CreateButton(text, callback)
	local Button = Instance.new("TextButton")
	Button.Size = UDim2.new(1, 0, 0, 35)
	Button.BackgroundColor3 = Color3.fromRGB(50, 50, 50)
	Button.Text = text
	Button.TextColor3 = Color3.fromRGB(255, 255, 255)
	Button.Font = Enum.Font.SourceSansBold
	Button.TextSize = 18
	Button.ZIndex = 1
	Button.Parent = ContentContainer
	Instance.new("UICorner", Button).CornerRadius = UDim.new(0, 6)

	Button.MouseEnter:Connect(function()
		Button.BackgroundColor3 = Color3.fromRGB(80, 80, 80)
	end)
	Button.MouseLeave:Connect(function()
		Button.BackgroundColor3 = Color3.fromRGB(50, 50, 50)
	end)

	Button.MouseButton1Click:Connect(callback)
	return Button
end

-- Toggle (checkbox)
local function CreateToggle(text, callback)
    local ToggleContainer = Instance.new("Frame")
    ToggleContainer.Size = UDim2.new(1, 0, 0, 30)
    ToggleContainer.BackgroundTransparency = 1
    ToggleContainer.ZIndex = 1
    ToggleContainer.Parent = ContentContainer

    local Toggle = Instance.new("TextButton")
    Toggle.Size = UDim2.new(1, 0, 1, 0)
    Toggle.BackgroundTransparency = 1
    Toggle.Text = text
    Toggle.TextColor3 = Color3.fromRGB(255, 255, 255)
    Toggle.Font = Enum.Font.SourceSansBold
    Toggle.TextSize = 18
    Toggle.TextXAlignment = Enum.TextXAlignment.Left
    Toggle.ZIndex = 1
    Toggle.Parent = ToggleContainer

    local Box = Instance.new("Frame", Toggle)
    Box.Size = UDim2.new(0, 20, 0, 20)
    Box.Position = UDim2.new(1, -25, 0.5, -10)
    Box.BackgroundColor3 = Color3.fromRGB(40, 40, 40)
    Box.ZIndex = 1
    Instance.new("UICorner", Box).CornerRadius = UDim.new(0, 4)

    return Toggle, Box
end
