# whip_loadingscreen

The loading screen for [WHIP](https://github.com/WHIPFX/txAdmin-recipe): the WHIP logo over a drifting 3D blueprint,
shown from the moment a player connects until they're in the world.

## Features

- **The logo is the loading light.** The four circles of the logo's I light up in turn, each with one of WHIP's
  interaction icons.
- **A blueprint of WHIP.** Behind the logo, a blueprint sheet tilted in 3D drifts past, drawn with garages, a shop, a
  house, Director runs and interaction prompts.
- **A fallback.** A game that can't run WebGL 2 shows the logo on black.

## Requirements

None. It's a web page with no scripts of its own. On a WHIP server, `whip_core` closes it once the player is in the
world.

## Installation

WHIP's txAdmin recipe installs it.

By hand, put `whip_loadingscreen` in your `resources` folder and add this line to `server.cfg`, after
`ensure whip_core`:

```cfg
ensure whip_loadingscreen
```

Run one loading screen only. WHIP's setup report (`whipsetup` in the server console) flags a second one. To use a
different loading screen, remove this one and ensure yours: whip_core closes any loading screen.

## Changing it

To see it in a browser, run `node dev/bp/serve.js` and open the address it prints. To change the blueprint, edit
`dev/blueprint.js` and run `node dev/blueprint.js`; it needs Node.js and Google Chrome (set `CHROME` to Chrome's path
if it isn't found). Nothing in `dev/` is sent to players.

## License

whip_loadingscreen is licensed under the GNU LGPL 3.0; see `LICENSE`. The licence doesn't cover the WHIP name and
logo. Third-party material is listed in `whip_core`'s `NOTICE.md`, including three.js (MIT).
