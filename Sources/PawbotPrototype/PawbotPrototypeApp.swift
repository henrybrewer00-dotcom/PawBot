import AppKit
import AVFoundation
import Combine
import Speech
import SwiftUI

@main
struct PawbotPrototypeApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var controller: PawbotWindowController?

    @MainActor
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        controller = PawbotWindowController()
        controller?.show()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }
}

struct PawbotMessage: Identifiable, Equatable {
    let id = UUID()
    let text: String
    let isUser: Bool
}

@MainActor
final class PawbotModel: ObservableObject {
    @Published var isExpanded = false
    @Published var showPeek = false
    @Published var selectedAction = "Explain my screen"
    @Published var isListening = false
    @Published var notificationIndex = 0
    @Published var draftText = ""
    @Published var hasStartedConversation = false
    @Published var messages: [PawbotMessage] = []
    @Published var isPawbotThinking = false
    @Published var fontScale: CGFloat = 1.0
    @Published var isSpeaking = false

    private let speech = PawbotSpeech()
    private let voice = PawbotVoiceInput()
    private var screenshotPollingTask: Task<Void, Never>?

    let actions = [
        PawbotAction(title: "Explain my screen", subtitle: "See and explain it plainly", icon: "eye.fill", color: .orange),
        PawbotAction(title: "Make bigger", subtitle: "Increase screen text", icon: "textformat.size", color: .green),
        PawbotAction(title: "Help me reply", subtitle: "Draft a friendly answer", icon: "bubble.left.and.bubble.right.fill", color: .indigo)
    ]

    let notifications = [
        PawbotNotice(title: "This text looks small", body: "Want me to make it easier to read?", primary: "Make bigger", secondary: "Not now", icon: "textformat.size"),
        PawbotNotice(title: "New message from Sarah", body: "I can read it aloud or help you reply.", primary: "Read aloud", secondary: "Help reply", icon: "envelope.fill"),
        PawbotNotice(title: "Reminder ready", body: "Doctor appointment at 3:30 PM.", primary: "Done", secondary: "Later", icon: "bell.fill")
    ]

    func toggleExpanded() {
        withAnimation(.easeInOut(duration: 0.95)) {
            if isExpanded {
                closePanel()
            } else {
                openPanel()
            }
        }
    }

    func openPanel() {
        isExpanded = true
        showPeek = false
    }

    func closePanel() {
        isExpanded = false
        showPeek = false
        resetConversation()
    }

    func resetConversation() {
        speech.stop()
        isSpeaking = false
        isPawbotThinking = false
        hasStartedConversation = false
        messages.removeAll()
        draftText = ""
        fontScale = 1.0
        screenshotPollingTask?.cancel()
        screenshotPollingTask = nil
        PawbotConsent.userConsentedThisSession = false
        Task { await PawbotAI.shared.resetHistory() }
    }

    func goHome() {
        withAnimation(.easeInOut(duration: 0.55)) {
            resetConversation()
        }
    }

    func dismissPeek() {
        withAnimation(.easeInOut(duration: 0.55)) {
            showPeek = false
        }
    }

    func toggleVoiceInput() {
        if voice.isRecording {
            voice.stopAndFinalize()
            return
        }
        Task { @MainActor in
            let started = await voice.start(
                onPartial: { [weak self] text in
                    self?.draftText = text
                },
                onFinal: { [weak self] text in
                    guard let self else { return }
                    self.draftText = text
                    withAnimation(.easeInOut(duration: 0.45)) { self.isListening = false }
                    if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        self.sendPrototypeMessage()
                    }
                },
                onError: { [weak self] message in
                    guard let self else { return }
                    withAnimation(.easeInOut(duration: 0.45)) { self.isListening = false }
                    self.appendBot(message)
                }
            )
            if started {
                withAnimation(.easeInOut(duration: 0.45)) { isListening = true }
                if !hasStartedConversation {
                    withAnimation(.easeInOut(duration: 0.55)) { hasStartedConversation = true }
                }
            }
        }
    }

    func noteTyping(_ text: String) {
        draftText = text
    }

    func sendPrototypeMessage() {
        let trimmed = draftText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let userMessage = PawbotMessage(text: trimmed, isUser: true)
        withAnimation(.easeInOut(duration: 0.55)) {
            if !hasStartedConversation {
                hasStartedConversation = true
            }
            messages.append(userMessage)
            draftText = ""
            isPawbotThinking = true
        }

        if screenshotPollingTask != nil, PawbotScreenCapture.tryCapture() != nil {
            screenshotPollingTask?.cancel()
            screenshotPollingTask = nil
            lookAtScreen(prompt: trimmed)
            return
        }

        if Self.looksLikeScreenshotRequest(trimmed) {
            lookAtScreen(prompt: trimmed)
            return
        }

        Task { @MainActor in
            let reply: String
            do {
                reply = try await PawbotAI.shared.reply(to: trimmed)
            } catch {
                let detail = (error as? LocalizedError)?.errorDescription ?? "\(error)"
                NSLog("[Pawbot] AI error: %@", detail)
                reply = "(Grok error — \(detail))"
            }
            withAnimation(.easeInOut(duration: 0.55)) {
                isPawbotThinking = false
                messages.append(PawbotMessage(text: reply, isUser: false))
            }
        }
    }

    private static func looksLikeScreenshotRequest(_ text: String) -> Bool {
        let t = text.lowercased()
        let phrases = [
            "screen", "screenshot", "what do you see", "look at my", "look at this",
            "what's on my", "whats on my", "what is on my", "read my screen",
            "read this", "see my", "see what", "see this", "show me what", "tell me what's"
        ]
        return phrases.contains { t.contains($0) }
    }


    func cycleNotice() {
        withAnimation(.easeInOut(duration: 0.9)) {
            notificationIndex = (notificationIndex + 1) % notifications.count
            showPeek = true
        }
    }

    func performAction(_ action: PawbotAction) {
        selectedAction = action.title
        if !hasStartedConversation {
            withAnimation(.easeInOut(duration: 0.55)) { hasStartedConversation = true }
        }
        switch action.title {
        case "Explain my screen": lookAtScreen()
        case "Make bigger": cycleFontSize()
        case "Help me reply": startReplyHelper()
        default: break
        }
    }

    func readLatestAloud() {
        if isSpeaking {
            speech.stop()
            isSpeaking = false
            return
        }
        let target: String
        if let lastBot = messages.reversed().first(where: { !$0.isUser })?.text, !lastBot.isEmpty {
            target = lastBot
        } else {
            target = "Hi there. I'm right here whenever you need me. Type a message or pick one of the buttons below."
        }
        let reply = "Reading that aloud for you now."
        appendBot(reply)
        recordSyntheticExchange(user: "Read that aloud, please.", assistant: reply)
        isSpeaking = true
        speech.speak(target) { [weak self] in
            Task { @MainActor in self?.isSpeaking = false }
        }
    }

    func cycleFontSize() {
        let next: CGFloat
        switch fontScale {
        case ..<1.05: next = 1.25
        case 1.05..<1.4: next = 1.5
        default: next = 1.0
        }
        withAnimation(.easeInOut(duration: 0.55)) {
            fontScale = next
        }
        let label = next == 1.0 ? "back to normal size" : (next == 1.25 ? "a bit bigger" : "much bigger")
        let reply = "Okay — text is \(label) now. Tap Make Bigger again to change."
        appendBot(reply)
        recordSyntheticExchange(user: "Make the text bigger.", assistant: reply)
    }

    func startReplyHelper() {
        let reply = "Sure. What did the message say, and what would you like to tell them?"
        appendBot(reply)
        recordSyntheticExchange(user: "Help me write a reply.", assistant: reply)
        if !hasStartedConversation {
            withAnimation(.easeInOut(duration: 0.55)) { hasStartedConversation = true }
        }
    }

    private func recordSyntheticExchange(user: String, assistant: String) {
        Task { await PawbotAI.shared.recordExchange(user: user, assistant: assistant) }
    }

    private func startScreenshotPolling(retryPrompt: String?) {
        screenshotPollingTask?.cancel()
        screenshotPollingTask = Task { @MainActor [weak self] in
            for tick in 0..<120 {
                try? await Task.sleep(for: .seconds(1))
                if Task.isCancelled { return }
                if PawbotScreenCapture.tryCapture() != nil {
                    guard let self else { return }
                    self.appendBot("Got it — permission granted. Taking a look now.")
                    self.lookAtScreen(prompt: retryPrompt)
                    return
                }
                if tick == 25 {
                    self?.appendBot("If macOS isn't picking it up, try fully quitting Pawbot and reopening — that's a common quirk for unsigned apps.")
                }
            }
        }
    }

    func lookAtScreen(prompt customPrompt: String? = nil, skipConsent: Bool = false) {
        if !hasStartedConversation {
            withAnimation(.easeInOut(duration: 0.55)) { hasStartedConversation = true }
        }

        if !skipConsent && !PawbotConsent.userConsentedThisSession {
            isPawbotThinking = false
            Task { @MainActor in
                let approved = await PawbotConsent.askToLookAtScreen()
                if approved {
                    PawbotConsent.userConsentedThisSession = true
                    self.lookAtScreen(prompt: customPrompt, skipConsent: true)
                } else {
                    self.appendBot("Okay — I won't look at the screen. Just say the word when you change your mind.")
                }
            }
            return
        }

        if !isPawbotThinking { isPawbotThinking = true }

        let basePrompt = "I'm helping an older adult use their computer. In 2-3 short, friendly sentences, plainly describe what's on their screen and what they might want help with. No jargon."
        let prompt: String
        if let customPrompt, !customPrompt.isEmpty {
            prompt = "\(basePrompt)\n\nThey just asked: \"\(customPrompt)\". Answer that specifically based on what's on the screen."
        } else {
            prompt = basePrompt
        }

        Task { @MainActor in
            let result: String
            switch await PawbotScreenCapture.captureWithPermission() {
            case .denied:
                result = "I need your permission to see the screen. macOS just opened (or will open) the Privacy & Security panel — flip on Pawbot under Screen Recording, and I'll try again on my own as soon as you do."
                startScreenshotPolling(retryPrompt: customPrompt)
            case .failed(let reason):
                result = "I couldn't grab the screen — \(reason)"
            case .image(let image):
                do {
                    result = try await PawbotAI.shared.describe(image: image, prompt: prompt)
                    let userTurn = customPrompt ?? "Pawbot, look at my screen and tell me what's on it."
                    await PawbotAI.shared.recordExchange(user: userTurn, assistant: "(Looked at the screen.) \(result)")
                } catch PawbotAIError.missingKey {
                    result = "I'd love to look, but I'm missing my AI key."
                } catch {
                    let detail = (error as? LocalizedError)?.errorDescription ?? "\(error)"
                    result = "(Grok vision error — \(detail))"
                }
            }
            withAnimation(.easeInOut(duration: 0.55)) {
                isPawbotThinking = false
                messages.append(PawbotMessage(text: result, isUser: false))
            }
            if let customPrompt, customPrompt.lowercased().contains("read") {
                speech.speak(result) { [weak self] in
                    Task { @MainActor in self?.isSpeaking = false }
                }
                isSpeaking = true
            }
        }
    }

    private func appendBot(_ text: String) {
        withAnimation(.easeInOut(duration: 0.45)) {
            messages.append(PawbotMessage(text: text, isUser: false))
        }
    }

    func showFirstPeekWhenSettled() {
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(1.6))
            guard !isExpanded else { return }
            withAnimation(.easeInOut(duration: 1.1)) {
                showPeek = true
            }
        }
    }
}

struct PawbotAction: Identifiable {
    let id = UUID()
    let title: String
    let subtitle: String
    let icon: String
    let color: Color
}

struct PawbotNotice {
    let title: String
    let body: String
    let primary: String
    let secondary: String
    let icon: String
}

final class KeyableBorderlessWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

@MainActor
final class PawbotWindowController {
    private let model = PawbotModel()
    private let window: NSWindow
    private var conversationCancellable: AnyCancellable?
    private var expandCancellable: AnyCancellable?

    private static let idleSize = NSSize(width: 620, height: 560)
    private static let conversationSize = NSSize(width: 760, height: 740)

    init() {
        let contentView = PawbotRootView(model: model)
        window = KeyableBorderlessWindow(
            contentRect: .init(origin: .zero, size: Self.idleSize),
            styleMask: [.titled, .fullSizeContentView, .closable],
            backing: .buffered,
            defer: false
        )
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.standardWindowButton(.closeButton)?.isHidden = true
        window.standardWindowButton(.miniaturizeButton)?.isHidden = true
        window.standardWindowButton(.zoomButton)?.isHidden = true
        window.isMovableByWindowBackground = true
        window.backgroundColor = .clear
        window.isOpaque = false
        window.hasShadow = false
        window.level = .floating
        window.isReleasedWhenClosed = false
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        window.contentView = NSHostingView(rootView: contentView)

        conversationCancellable = model.$hasStartedConversation
            .removeDuplicates()
            .sink { [weak self] started in
                self?.resizeWindow(forConversation: started)
            }

        expandCancellable = model.$isExpanded
            .removeDuplicates()
            .sink { [weak self] expanded in
                if expanded {
                    self?.takeKeyFocus()
                }
            }
    }

    func show() {
        resizeWindow(forConversation: model.hasStartedConversation, animated: false)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func takeKeyFocus() {
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
    }

    private func resizeWindow(forConversation started: Bool, animated: Bool = true) {
        guard let screen = NSScreen.main else { return }
        let visible = screen.visibleFrame
        let target = started ? Self.conversationSize : Self.idleSize
        let x = visible.maxX - target.width - 16
        let y = max(visible.minY + 12, visible.midY - target.height / 2)
        let frame = NSRect(x: x, y: y, width: target.width, height: target.height)
        window.setFrame(frame, display: true, animate: animated)
    }
}

struct PawbotRootView: View {
    @ObservedObject var model: PawbotModel
    @State private var glow = false
    @State private var iconDraw = false

    var body: some View {
        ZStack(alignment: .trailing) {
            Color.clear.allowsHitTesting(false)

            if model.isExpanded {
                expandedPanel
                    .transition(.asymmetric(
                        insertion: .move(edge: .trailing).combined(with: .opacity).combined(with: .scale(scale: 0.98, anchor: .trailing)),
                        removal: .move(edge: .trailing).combined(with: .opacity)
                    ))
                    .padding(.trailing, 58)
            }

            VStack(spacing: 12) {
                if model.showPeek && !model.isExpanded {
                    notificationPeek
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                }

                sideTab
            }
            .padding(.trailing, 12)
        }
        .frame(
            width: model.hasStartedConversation ? 760 : 620,
            height: model.hasStartedConversation ? 740 : 560
        )
        .onAppear {
            withAnimation(.easeInOut(duration: 3.2).repeatForever(autoreverses: true)) {
                glow = true
            }
            withAnimation(.easeInOut(duration: 2.4).repeatForever(autoreverses: false)) {
                iconDraw = true
            }
            model.showFirstPeekWhenSettled()
        }
    }

    private var sideTab: some View {
        Button(action: model.toggleExpanded) {
            VStack(spacing: 9) {
                ZStack {
                    AssistantMark(isActive: glow)
                        .frame(width: 38, height: 38)

                    DrawnIconRing(progress: iconDraw ? 1 : 0)
                        .frame(width: 52, height: 52)
                        .opacity(model.isExpanded ? 0.35 : 0.9)
                }

                Text("Pawbot")
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundStyle(.primary)
                    .rotationEffect(.degrees(-90))
                    .frame(width: 62, height: 28)

                Image(systemName: model.isExpanded ? "chevron.right" : "chevron.left")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.secondary)
            }
            .frame(width: 54, height: 148)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(.white.opacity(0.48), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.13), radius: 18, x: 0, y: 10)
            .shadow(color: .blue.opacity(glow ? 0.16 : 0.05), radius: glow ? 16 : 6)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open Pawbot")
    }

    private var notificationPeek: some View {
        let notice = model.notifications[model.notificationIndex]

        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: notice.icon)
                    .font(.system(size: 19, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(Color.blue.opacity(0.92), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(notice.title)
                        .font(.system(size: 19, weight: .bold, design: .rounded))
                    Text(notice.body)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            HStack(spacing: 12) {
                MockButton(title: notice.primary, tint: .blue, action: model.toggleExpanded)
                MockButton(title: notice.secondary, tint: .gray, action: model.dismissPeek)
            }
        }
        .padding(14)
        .frame(width: 318)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(.white.opacity(0.55), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.12), radius: 22, x: 0, y: 12)
    }

    private var expandedPanel: some View {
        VStack(alignment: .leading, spacing: model.hasStartedConversation ? 14 : 12) {
            HStack(spacing: 12) {
                Button(action: model.goHome) {
                    HStack(spacing: 12) {
                        AssistantMark(isActive: true)
                            .frame(width: 42, height: 42)

                        VStack(alignment: .leading, spacing: 4) {
                            Text("Pawbot")
                                .font(.system(size: 24, weight: .bold, design: .rounded))
                            Text(model.hasStartedConversation ? "Tap to go home" : "Here when the screen gets tricky")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("Back to home")

                Spacer()

                if model.hasStartedConversation {
                    Button(action: model.goHome) {
                        Image(systemName: "house.fill")
                            .font(.system(size: 20, weight: .bold))
                            .frame(width: 42, height: 42)
                    }
                    .buttonStyle(IconButtonStyle())
                    .help("Back to home")
                } else {
                    Button(action: model.cycleNotice) {
                        Image(systemName: "bell.badge.fill")
                            .font(.system(size: 20, weight: .bold))
                            .frame(width: 42, height: 42)
                    }
                    .buttonStyle(IconButtonStyle())
                }
            }

            if !model.hasStartedConversation {
                VStack(alignment: .leading, spacing: 8) {
                    ChatBubble(text: "Need help with what's on screen?", isUser: false)
                }

                LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], spacing: 10) {
                    ForEach(model.actions) { action in
                        ActionCard(action: action, isSelected: model.selectedAction == action.title) {
                            model.performAction(action)
                        }
                    }
                }
            } else {
                ConversationScrollView(messages: model.messages, isThinking: model.isPawbotThinking, fontScale: model.fontScale)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

                HStack(spacing: 8) {
                    ForEach(model.actions) { action in
                        QuickActionPill(action: action, isActive: false) {
                            model.performAction(action)
                        }
                    }
                }
            }

            HStack(spacing: 12) {
                HStack(spacing: 10) {
                    Image(systemName: "text.cursor")
                        .font(.system(size: 19, weight: .bold))
                        .foregroundStyle(.secondary)
                    PawbotInputField(
                        text: Binding(get: { model.draftText }, set: { model.noteTyping($0) }),
                        placeholder: "Ask Pawbot...",
                        fontSize: 19 * model.fontScale,
                        onSubmit: model.sendPrototypeMessage
                    )
                    .frame(height: 30)
                }
                .padding(.horizontal, 16)
                .frame(height: 52)
                .background(.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(Color.blue.opacity(0.35), lineWidth: 1.5)
                )

                Button(action: model.toggleVoiceInput) {
                    Image(systemName: model.isListening ? "waveform" : "mic.fill")
                        .font(.system(size: 23, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 54, height: 54)
                        .background(model.isListening ? Color.red.opacity(0.95) : Color.blue.opacity(0.95), in: Circle())
                        .scaleEffect(model.isListening ? 1.08 : 1)
                        .shadow(color: (model.isListening ? Color.red : Color.blue).opacity(0.32), radius: model.isListening ? 18 : 9)
                }
                .buttonStyle(.plain)
                .help(model.isListening ? "Stop listening" : "Speak instead of type")
            }
        }
        .padding(18)
        .frame(
            width: model.hasStartedConversation ? 600 : 390,
            height: model.hasStartedConversation ? 640 : nil,
            alignment: .top
        )
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(.white.opacity(0.6), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.15), radius: 22, x: 0, y: 12)
    }

}

struct DrawnIconRing: View {
    let progress: CGFloat

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 19, style: .continuous)
                .trim(from: max(0, progress - 0.72), to: progress)
                .stroke(
                    Color.blue.opacity(0.78),
                    style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round)
                )
                .rotationEffect(.degrees(-12))

            RoundedRectangle(cornerRadius: 17, style: .continuous)
                .trim(from: max(0, progress - 0.5), to: progress)
                .stroke(
                    Color.teal.opacity(0.42),
                    style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round)
                )
                .rotationEffect(.degrees(18))
                .padding(3)
        }
    }
}

struct AssistantMark: View {
    var isActive: Bool

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [Color.blue.opacity(0.95), Color.teal.opacity(0.9)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .shadow(color: .blue.opacity(isActive ? 0.2 : 0.08), radius: isActive ? 10 : 4)

            VStack(spacing: 6) {
                HStack(spacing: 7) {
                    Circle().fill(.white).frame(width: 6, height: 6)
                    Circle().fill(.white).frame(width: 6, height: 6)
                }

                Capsule()
                    .fill(.white.opacity(0.86))
                    .frame(width: 17, height: 4)
            }
        }
        .overlay(alignment: .topTrailing) {
            Circle()
                .fill(Color.green)
                .frame(width: 11, height: 11)
                .overlay(Circle().stroke(.white, lineWidth: 2))
                .offset(x: 4, y: -4)
        }
    }
}

struct ConversationScrollView: View {
    let messages: [PawbotMessage]
    let isThinking: Bool
    let fontScale: CGFloat

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 10) {
                    ChatBubble(text: "Hi — I'm right here. What can I help you with?", isUser: false, fontScale: fontScale)
                        .id("intro")

                    ForEach(messages) { message in
                        ChatBubble(text: message.text, isUser: message.isUser, fontScale: fontScale)
                            .id(message.id)
                            .transition(.asymmetric(
                                insertion: .opacity.combined(with: .move(edge: message.isUser ? .trailing : .leading)),
                                removal: .opacity
                            ))
                    }

                    if isThinking {
                        ThinkingBubble()
                            .id("thinking")
                            .transition(.opacity)
                    }
                }
                .padding(.vertical, 4)
            }
            .onChange(of: messages.count) { _, _ in
                scrollToBottom(proxy: proxy)
            }
            .onChange(of: isThinking) { _, _ in
                scrollToBottom(proxy: proxy)
            }
        }
    }

    private func scrollToBottom(proxy: ScrollViewProxy) {
        let target: AnyHashable = isThinking
            ? AnyHashable("thinking")
            : (messages.last.map { AnyHashable($0.id) } ?? AnyHashable("intro"))
        withAnimation(.easeInOut(duration: 0.45)) {
            proxy.scrollTo(target, anchor: .bottom)
        }
    }
}

struct ThinkingBubble: View {
    @State private var phase: CGFloat = 0

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(.secondary)
                    .frame(width: 8, height: 8)
                    .opacity(0.4 + 0.6 * abs(sin(phase + CGFloat(i) * 0.6)))
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .background(Color.white.opacity(0.56), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .frame(maxWidth: .infinity, alignment: .leading)
        .onAppear {
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: false)) {
                phase = .pi * 2
            }
        }
    }
}

struct ChatBubble: View {
    let text: String
    let isUser: Bool
    var fontScale: CGFloat = 1.0

    var body: some View {
        Text(text)
            .font(.system(size: 19 * fontScale, weight: .semibold, design: .rounded))
            .foregroundStyle(isUser ? .white : .primary)
            .padding(.horizontal, 15)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isUser ? Color.blue : Color.white.opacity(0.56), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .textSelection(.enabled)
    }
}

struct ActionCard: View {
    let action: PawbotAction
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 7) {
                Image(systemName: action.icon)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(action.color)
                    .frame(width: 36, height: 36)
                    .background(action.color.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                Text(action.title)
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundStyle(.primary)
                    .minimumScaleFactor(0.8)

                Text(action.subtitle)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 96, alignment: .leading)
            .background(.white.opacity(isSelected ? 0.78 : 0.5), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(isSelected ? action.color.opacity(0.75) : .white.opacity(0.5), lineWidth: isSelected ? 2 : 1)
            )
            .scaleEffect(isSelected ? 1.015 : 1)
        }
        .buttonStyle(.plain)
    }
}

struct ConversationHint: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(.blue)
                .frame(width: 34, height: 34)
                .background(.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 11, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                Text(message)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding(12)
        .background(.white.opacity(0.5), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

struct MockButton: View {
    let title: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .foregroundStyle(tint == .gray ? Color.primary : Color.white)
                .padding(.horizontal, 16)
                .frame(height: 42)
                .background(tint == .gray ? Color.white.opacity(0.62) : tint.opacity(0.94), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct IconButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(.primary)
            .background(.white.opacity(configuration.isPressed ? 0.82 : 0.56), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

enum PawbotAIError: Error, LocalizedError {
    case missingKey
    case badResponse(Int, String)
    case noContent
    case transport(String)

    var errorDescription: String? {
        switch self {
        case .missingKey: return "AI key missing"
        case .badResponse(let code, let body):
            let snippet = body.prefix(220)
            return "AI HTTP \(code): \(snippet)"
        case .noContent: return "AI returned no content"
        case .transport(let detail): return "Network error: \(detail)"
        }
    }
}

actor PawbotAI {
    static let shared = PawbotAI()

    private let session: URLSession
    private let apiKey: String?
    private let endpoint = URL(string: "https://api.x.ai/v1/chat/completions")!
    private let textModelCandidates = ["grok-4-fast-non-reasoning", "grok-4-0709", "grok-3", "grok-3-mini", "grok-2-latest"]
    private let visionModelCandidates = ["grok-4-fast-non-reasoning", "grok-4-0709", "grok-4-fast-reasoning"]
    private var cachedTextModel: String?
    private var cachedVisionModel: String?
    private var discoveredModels: [String]?
    private let systemPrompt = """
    You are Pawbot, a calm and patient assistant designed to help older adults \
    with what's on their computer screen. Speak gently. Use short sentences and \
    plain words. Offer one step at a time. Never use jargon. If asked to read \
    aloud, explain, enlarge text, or help reply to a message, walk them through \
    it kindly. Keep responses under 3 sentences unless they ask for more.
    """

    private var history: [[String: String]] = []

    init() {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 12
        config.timeoutIntervalForResource = 14
        self.session = URLSession(configuration: config)
        self.apiKey = Self.loadAPIKey()
    }

    private static func loadAPIKey() -> String? {
        let env = ProcessInfo.processInfo.environment
        for name in ["XAI_API_KEY", "GROK_API_KEY"] {
            if let value = env[name], !value.isEmpty { return value }
        }
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        guard let path = support?.appendingPathComponent("Pawbot/xai_api_key") else { return nil }
        guard let data = try? Data(contentsOf: path) else { return nil }
        let key = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (key?.isEmpty == false) ? key : nil
    }

    var isConfigured: Bool { apiKey != nil }

    func reply(to userText: String) async throws -> String {
        guard let apiKey else { throw PawbotAIError.missingKey }

        history.append(["role": "user", "content": userText])
        let messages: [[String: String]] = [["role": "system", "content": systemPrompt]] + history.suffix(20)

        var lastError: Error = PawbotAIError.noContent
        let order = (cachedTextModel.map { [$0] } ?? []) + textModelCandidates.filter { $0 != cachedTextModel }
        for model in order {
            do {
                let trimmed = try await postChat(apiKey: apiKey, model: model, messages: messages, temperature: 0.5)
                cachedTextModel = model
                history.append(["role": "assistant", "content": trimmed])
                return trimmed
            } catch {
                lastError = error
                if case PawbotAIError.badResponse(let code, _) = error, code != 404 && code != 400 { break }
            }
        }
        if history.last?["role"] == "user" { history.removeLast() }
        throw lastError
    }

    private func postChat(apiKey: String, model: String, messages: [[String: Any]], temperature: Double) async throws -> String {
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        let body: [String: Any] = [
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": 260
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw PawbotAIError.transport(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw PawbotAIError.transport("no http response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let bodyText = String(data: data, encoding: .utf8) ?? ""
            throw PawbotAIError.badResponse(http.statusCode, bodyText)
        }
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let choices = json?["choices"] as? [[String: Any]]
        let message = choices?.first?["message"] as? [String: Any]
        guard let content = message?["content"] as? String, !content.isEmpty else {
            throw PawbotAIError.noContent
        }
        return content.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func resetHistory() {
        history.removeAll()
    }

    func recordExchange(user: String, assistant: String) {
        history.append(["role": "user", "content": user])
        history.append(["role": "assistant", "content": assistant])
    }

    private func discoverModels() async -> [String] {
        if let discoveredModels { return discoveredModels }
        guard let apiKey else { return [] }
        var request = URLRequest(url: URL(string: "https://api.x.ai/v1/models")!)
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        do {
            let (data, _) = try await session.data(for: request)
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            let list = json?["data"] as? [[String: Any]] ?? []
            let ids = list.compactMap { $0["id"] as? String }
            discoveredModels = ids
            return ids
        } catch {
            return []
        }
    }

    func describe(image: NSImage, prompt: String) async throws -> String {
        guard let apiKey else { throw PawbotAIError.missingKey }
        guard let pngData = image.pngData() else { throw PawbotAIError.noContent }
        let base64 = pngData.base64EncodedString()
        let dataURL = "data:image/png;base64,\(base64)"

        let messages: [[String: Any]] = [
            ["role": "system", "content": systemPrompt],
            ["role": "user", "content": [
                ["type": "text", "text": prompt],
                ["type": "image_url", "image_url": ["url": dataURL]]
            ]]
        ]

        var lastError: Error = PawbotAIError.noContent
        let discovered = await discoverModels()
        let visionFromDiscovery = discovered.filter { id in
            let lower = id.lowercased()
            if lower.contains("imagine") || lower.contains("video") || lower.contains("code-fast") { return false }
            return lower.contains("vision") || lower.contains("grok-4")
        }
        var order = (cachedVisionModel.map { [$0] } ?? [])
        for m in visionFromDiscovery where !order.contains(m) { order.append(m) }
        for m in visionModelCandidates where !order.contains(m) { order.append(m) }

        for model in order {
            do {
                let result = try await postChat(apiKey: apiKey, model: model, messages: messages, temperature: 0.4)
                cachedVisionModel = model
                return result
            } catch {
                lastError = error
                if case PawbotAIError.badResponse(let code, _) = error, code != 404 && code != 400 { break }
            }
        }
        if discovered.isEmpty {
            throw lastError
        }
        let detail = (lastError as? LocalizedError)?.errorDescription ?? "\(lastError)"
        throw PawbotAIError.transport("\(detail). Available models: \(discovered.joined(separator: ", "))")
    }
}

extension NSImage {
    func pngData() -> Data? {
        guard let tiff = tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { return nil }
        return rep.representation(using: .png, properties: [:])
    }
}

@MainActor
final class PawbotSpeech {
    private let synth = AVSpeechSynthesizer()

    func speak(_ text: String, completion: @escaping () -> Void) {
        synth.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.92
        utterance.pitchMultiplier = 1.05
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        let delegate = SpeechFinishObserver(onFinish: completion)
        Self.observers.append(delegate)
        synth.delegate = delegate
        synth.speak(utterance)
    }

    func stop() {
        synth.stopSpeaking(at: .immediate)
    }

    private static var observers: [SpeechFinishObserver] = []
}

private final class SpeechFinishObserver: NSObject, AVSpeechSynthesizerDelegate, @unchecked Sendable {
    let onFinish: () -> Void
    init(onFinish: @escaping () -> Void) { self.onFinish = onFinish }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        onFinish()
    }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        onFinish()
    }
}

@MainActor
final class PawbotVoiceInput {
    private(set) var isRecording = false
    private let audioEngine = AVAudioEngine()
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var partialTranscript = ""

    func start(
        onPartial: @escaping (String) -> Void,
        onFinal: @escaping (String) -> Void,
        onError: @escaping (String) -> Void
    ) async -> Bool {
        let speechAuth: SFSpeechRecognizerAuthorizationStatus = await withCheckedContinuation { cont in
            SFSpeechRecognizer.requestAuthorization { status in cont.resume(returning: status) }
        }
        guard speechAuth == .authorized else {
            onError("I can't use speech recognition yet. Open System Settings → Privacy & Security → Speech Recognition and turn on Pawbot, then try again.")
            return false
        }

        let micGranted = await AVCaptureDevice.requestAccess(for: .audio)
        guard micGranted else {
            onError("I need permission to use the microphone. Open System Settings → Privacy & Security → Microphone and turn on Pawbot, then try again.")
            return false
        }

        guard let recognizer, recognizer.isAvailable else {
            onError("Speech recognition isn't available right now. Try again in a moment.")
            return false
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        self.request = request

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            onError("Couldn't start the microphone — \(error.localizedDescription)")
            cleanup()
            return false
        }

        partialTranscript = ""
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            if let result {
                let text = result.bestTranscription.formattedString
                Task { @MainActor in
                    self.partialTranscript = text
                    onPartial(text)
                    if result.isFinal {
                        onFinal(text)
                        self.cleanup()
                    }
                }
            }
            if error != nil {
                Task { @MainActor in
                    let final = self.partialTranscript
                    self.cleanup()
                    onFinal(final)
                }
            }
        }

        isRecording = true
        return true
    }

    func stopAndFinalize() {
        request?.endAudio()
    }

    private func cleanup() {
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        audioEngine.inputNode.removeTap(onBus: 0)
        task?.cancel()
        task = nil
        request = nil
        isRecording = false
    }
}

enum PawbotConsent {
    @MainActor static var userConsentedThisSession = false

    @MainActor
    static func askToLookAtScreen() async -> Bool {
        let alert = NSAlert()
        alert.messageText = "Let Pawbot look at your screen?"
        alert.informativeText = "Pawbot will take a quick screenshot of your main display so it can read and explain what's on it. The screenshot is sent to Grok and never saved."
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Continue")
        alert.addButton(withTitle: "Reject")
        if let icon = NSImage(systemSymbolName: "eye.fill", accessibilityDescription: nil) {
            alert.icon = icon
        }
        return alert.runModal() == .alertFirstButtonReturn
    }
}

enum PawbotScreenCaptureResult {
    case image(NSImage)
    case denied
    case failed(String)
}

enum PawbotScreenCapture {
    @MainActor
    static func tryCapture() -> NSImage? {
        guard let displayID = NSScreen.main?.displayID else { return nil }
        guard let cgImage = CGDisplayCreateImage(displayID) else { return nil }
        let size = NSSize(width: CGFloat(cgImage.width), height: CGFloat(cgImage.height))
        return NSImage(cgImage: cgImage, size: size)
    }

    @MainActor
    static func captureWithPermission() async -> PawbotScreenCaptureResult {
        if let image = tryCapture() {
            return .image(image)
        }
        CGRequestScreenCaptureAccess()
        try? await Task.sleep(for: .milliseconds(500))
        if let image = tryCapture() {
            return .image(image)
        }
        return .denied
    }
}

extension NSScreen {
    var displayID: CGDirectDisplayID? {
        deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID
    }
}

struct PawbotInputField: NSViewRepresentable {
    @Binding var text: String
    let placeholder: String
    let fontSize: CGFloat
    let onSubmit: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text, onSubmit: onSubmit)
    }

    func makeNSView(context: Context) -> NSTextField {
        let field = FocusableTextField(string: text)
        field.placeholderString = placeholder
        field.isBordered = false
        field.drawsBackground = false
        field.focusRingType = .none
        field.bezelStyle = .roundedBezel
        field.isBezeled = false
        field.font = .systemFont(ofSize: fontSize, weight: .semibold)
        field.delegate = context.coordinator
        field.target = context.coordinator
        field.action = #selector(Coordinator.commit(_:))
        field.cell?.usesSingleLineMode = true
        field.cell?.wraps = false
        field.cell?.isScrollable = true

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak field] in
            field?.window?.makeFirstResponder(field)
        }
        return field
    }

    func updateNSView(_ nsView: NSTextField, context: Context) {
        if nsView.stringValue != text {
            nsView.stringValue = text
        }
        nsView.font = .systemFont(ofSize: fontSize, weight: .semibold)
        context.coordinator.text = $text
        context.coordinator.onSubmit = onSubmit
    }

    @MainActor
    final class Coordinator: NSObject, NSTextFieldDelegate {
        var text: Binding<String>
        var onSubmit: () -> Void

        init(text: Binding<String>, onSubmit: @escaping () -> Void) {
            self.text = text
            self.onSubmit = onSubmit
        }

        nonisolated func controlTextDidChange(_ notification: Notification) {
            let value = (notification.object as? NSTextField)?.stringValue ?? ""
            MainActor.assumeIsolated {
                text.wrappedValue = value
            }
        }

        @objc func commit(_ sender: NSTextField) {
            text.wrappedValue = sender.stringValue
            onSubmit()
        }
    }
}

final class FocusableTextField: NSTextField {
    override var acceptsFirstResponder: Bool { true }

    override func becomeFirstResponder() -> Bool {
        let result = super.becomeFirstResponder()
        if result, let editor = currentEditor() as? NSTextView {
            editor.insertionPointColor = .controlAccentColor
        }
        return result
    }
}

struct QuickActionPill: View {
    let action: PawbotAction
    let isActive: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                Image(systemName: action.icon)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(isActive ? .white : action.color)
                Text(action.title)
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundStyle(isActive ? .white : .primary)
                    .lineLimit(1)
            }
            .padding(.horizontal, 12)
            .frame(height: 34)
            .background(isActive ? action.color.opacity(0.95) : .white.opacity(0.62), in: Capsule())
            .overlay(Capsule().stroke(action.color.opacity(0.4), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}