# whip_loadingscreen

whip's loading screen: the whip logo over a drifting blueprint, shown from the moment a player connects until whip_core
puts them in the world.

- **Needs:** nothing. It is a web page only, with no Lua; whip_core takes it away when the player has spawned.
- **Install:** WHIP's txAdmin recipe installs it and adds `ensure whip_loadingscreen` to server.cfg. Nothing else to add.
- **One loading screen:** take out any other loading screen resource. whip's setup report says when it finds one.
- **A player's game that cannot draw the blueprint** (no WebGL 2) shows the logo on black.
- **To change it:** `dev/blueprint.js` (see the comment at the top of `fxmanifest.lua`). Nothing in `dev/` is sent to
  players.
