import AppKit
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

@MainActor
final class PawbotModel: ObservableObject {
    @Published var isExpanded = false
    @Published var showPeek = false
    @Published var selectedAction = "Read aloud"
    @Published var isListening = false
    @Published var notificationIndex = 0
    @Published var draftText = ""
    @Published var hasStartedConversation = false

    let actions = [
        PawbotAction(title: "Read aloud", subtitle: "Speak the current text", icon: "speaker.wave.2.fill", color: .blue),
        PawbotAction(title: "Make bigger", subtitle: "Increase screen text", icon: "textformat.size", color: .green),
        PawbotAction(title: "Explain simply", subtitle: "Plain language help", icon: "lightbulb.fill", color: .orange),
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
    }

    func dismissPeek() {
        withAnimation(.easeInOut(duration: 0.55)) {
            showPeek = false
        }
    }

    func pulseVoice() {
        withAnimation(.easeInOut(duration: 0.75)) {
            isListening.toggle()
        }
    }

    func noteTyping(_ text: String) {
        draftText = text
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        withAnimation(.easeInOut(duration: 0.85)) {
            hasStartedConversation = true
        }
    }

    func sendPrototypeMessage() {
        guard !draftText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        withAnimation(.easeInOut(duration: 0.85)) {
            hasStartedConversation = true
        }
    }

    func cycleNotice() {
        withAnimation(.easeInOut(duration: 0.9)) {
            notificationIndex = (notificationIndex + 1) % notifications.count
            showPeek = true
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

@MainActor
final class PawbotWindowController {
    private let model = PawbotModel()
    private let window: NSWindow

    init() {
        let contentView = PawbotRootView(model: model)
        window = NSWindow(
            contentRect: .init(x: 0, y: 0, width: 620, height: 560),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        window.backgroundColor = .clear
        window.isOpaque = false
        window.hasShadow = false
        window.level = .floating
        window.isReleasedWhenClosed = false
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        window.contentView = NSHostingView(rootView: contentView)
    }

    func show() {
        positionWindow()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func positionWindow() {
        guard let screen = NSScreen.main else { return }
        let visible = screen.visibleFrame
        let x = visible.maxX - window.frame.width - 16
        let y = max(visible.minY + 12, visible.midY - window.frame.height / 2)
        window.setFrameOrigin(.init(x: x, y: y))
    }
}

struct PawbotRootView: View {
    @ObservedObject var model: PawbotModel
    @State private var glow = false
    @State private var iconDraw = false

    var body: some View {
        ZStack(alignment: .trailing) {
            Color.clear

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
        .frame(width: 620, height: 560)
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
                AssistantMark(isActive: true)
                    .frame(width: 42, height: 42)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Pawbot")
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                    Text("Here when the screen gets tricky")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                Button(action: model.cycleNotice) {
                    Image(systemName: "bell.badge.fill")
                        .font(.system(size: 20, weight: .bold))
                        .frame(width: 42, height: 42)
                }
                .buttonStyle(IconButtonStyle())
            }

            VStack(alignment: .leading, spacing: 8) {
                ChatBubble(text: model.hasStartedConversation ? "I can help. What should we make easier?" : "Need help with what's on screen?", isUser: false)

                if model.hasStartedConversation {
                    ChatBubble(text: model.draftText.isEmpty ? "Can you help me with this?" : model.draftText, isUser: true)
                    ChatBubble(text: "Sure. I’ll keep it simple and go one step at a time.", isUser: false)
                }
            }

            if !model.hasStartedConversation {
                LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], spacing: 10) {
                    ForEach(model.actions) { action in
                        ActionCard(action: action, isSelected: model.selectedAction == action.title) {
                            withAnimation(.easeInOut(duration: 0.55)) {
                                model.selectedAction = action.title
                            }
                        }
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    ConversationHint(icon: "text.magnifyingglass", title: "Bigger text", message: "I can enlarge the part you’re reading.")
                    ConversationHint(icon: "speaker.wave.2.fill", title: "Read aloud", message: "I can speak the answer slowly.")
                }
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }

            HStack(spacing: 12) {
                HStack(spacing: 10) {
                    Image(systemName: "text.cursor")
                        .font(.system(size: 19, weight: .bold))
                        .foregroundStyle(.secondary)
                    TextField("Ask Pawbot...", text: Binding(
                        get: { model.draftText },
                        set: { model.noteTyping($0) }
                    ))
                    .font(.system(size: 19, weight: .semibold, design: .rounded))
                    .textFieldStyle(.plain)
                    .onSubmit(model.sendPrototypeMessage)
                }
                .padding(.horizontal, 16)
                .frame(height: 52)
                .background(.white.opacity(0.62), in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                Button(action: model.pulseVoice) {
                    Image(systemName: model.isListening ? "waveform" : "mic.fill")
                        .font(.system(size: 23, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 54, height: 54)
                        .background(model.isListening ? Color.green.opacity(0.95) : Color.blue.opacity(0.95), in: Circle())
                        .scaleEffect(model.isListening ? 1.05 : 1)
                        .shadow(color: (model.isListening ? Color.green : Color.blue).opacity(0.24), radius: model.isListening ? 18 : 9)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(18)
        .frame(width: model.hasStartedConversation ? 500 : 390)
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

struct ChatBubble: View {
    let text: String
    let isUser: Bool

    var body: some View {
        Text(text)
            .font(.system(size: 19, weight: .semibold, design: .rounded))
            .foregroundStyle(isUser ? .white : .primary)
            .padding(.horizontal, 15)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isUser ? Color.blue : Color.white.opacity(0.56), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
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