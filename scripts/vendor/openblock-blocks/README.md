# OpenBlock Blocks generator bundles

These files are generated from `openblock-blocks` commit
`c4fe0c7e6437793d6c7899ec48537c2454bd3ad9` and are copied into the desktop
dependency before the GUI compatibility patches run.

The upstream repository intentionally ignores `arduino_compressed.js` and
`python_compressed.js`, and its legacy build requires Python 2. Keeping the
generated bundles here makes tagged desktop builds deterministic on GitHub
Actions. Update both bundles and the pinned Blocks commit together.
