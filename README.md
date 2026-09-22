# Adam Controller Simulator

A browser simulator of the ESP32 MIDI step-sequencer controller's front panel.

## Running it

`index.html` loads `web/ui.js` as `<script type="module">`, and browsers block ES
module loads over `file://` (CORS), so double-clicking the file will not work.
Serve the directory over HTTP instead, then open the `localhost` URL it prints:

```sh
npx serve .
# or
python -m http.server
```

Deployed to GitHub Pages it works as-is, since that serves over HTTP(S).

## Tests

```sh
npm test
```
