# PostWire Social Share

Post the note you are writing, or the text you selected, to your social media accounts without leaving Obsidian.

Run **Share note or selection to social media** from the command palette (or right-click in the editor). A window opens with the post already written: your selection, or the whole note without frontmatter, embeds and link brackets. Edit it, tick the networks, press **Post now**. You get a line per network saying whether it went out, with a link to the post.

## Setup

1. Create a free account at [postwire.io](https://postwire.io/dashboard.html?from=obsidian_readme) and connect your social accounts there.
2. Copy your API key from PostWire's settings.
3. In Obsidian, open **Settings → Community plugins → PostWire Social Share**, paste the key and select **Check**.

## What it does not do yet

- It posts text. Networks that only take a picture or a video show up greyed out.
- It does not schedule. Posts go out when you press the button.

## Disclosures

- **Account required.** The plugin does nothing without a PostWire account and its API key.
- **Payment.** PostWire has a free plan, on which one post goes to 2 networks. Sending one post to more networks needs a paid PostWire plan. When you reach the limit, the plugin shows PostWire's message and a link to its plans inside its own window.
- **Network use.** The plugin talks only to `https://postwire.io`: once to list your connected accounts when the window opens, and once to publish when you press the button. It sends the text you approved, the networks you ticked and your API key. PostWire then publishes to the networks you chose. Nothing is sent in the background, and no other note or file is read.
- **Storage.** Your API key and the networks you ticked last time are saved in this plugin's `data.json` inside your vault. If you sync or share your vault, that file goes with it.
- **No telemetry** in the plugin. PostWire's privacy policy: <https://postwire.io/privacy.html>.

## Support

<https://postwire.io/support.html> or support@postwire.io.

## License

MIT
