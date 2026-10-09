# clawd-minecraft

Your Claude usage, but as a Minecraft HUD (with Clawd walking around next to it). It sits right above the prompt box in the Claude desktop app.

![The HUD above the prompt box](screenshot.webp)

- **Hearts and armor:** how much of your 7-day limit is left
- **XP bar and number:** how much of your 5-hour limit is left (the number is the % remaining)
- **Hunger:** how much of the context window is left
- **Clawd:** paces around, waves under a "?" when Claude asks you something, and jumps when a turn finishes

## Install

You need Claude Code installed (a recent version, since mods are still early access) and a Claude subscription, since the bars read your plan's limits. Run these two in a terminal:

```bash
claude plugin marketplace add amsultan2010/clawd-minecraft
claude plugin install clawd-minecraft@clawd-minecraft
```

Then start a new session in the desktop app's Code tab. The HUD shows up after Claude's first reply.

## Or let Claude do it

Paste this into Claude Code (the Code tab works too):

```
Install the clawd-minecraft mod for me. Run `claude plugin marketplace add amsultan2010/clawd-minecraft` and then `claude plugin install clawd-minecraft@clawd-minecraft`, and tell me when it's done so I can start a new session.
```

## Contributing

Issues and pull requests are welcome. Before you open a PR, make sure these two still pass:

```bash
claude plugin validate .
claude plugin test .
```

## License

[MIT](LICENSE). That covers the code and the pixel art in this repo (all redrawn from scratch).

This is a fan project and isn't affiliated with Mojang, Microsoft or Anthropic. Minecraft and Clawd belong to their owners, and the license doesn't give you any rights to those names or characters.
