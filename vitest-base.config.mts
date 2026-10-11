import { defineConfig } from 'vitest/config';

// The app imports GoJS as 'gojs/release/go', and the GoJS extensions import it
// as 'gojs'. Both must be the very same file: two copies of the library do not
// recognise each other's objects. Left to itself, the test runner would load the
// debug build for 'gojs'. So both packages are handed to the runner to process
// (inline), and 'gojs' is pointed at the release build. For the app itself the
// `conditions` option in angular.json does the same.
export default defineConfig({
  resolve: {
    alias: [{ find: /^gojs$/, replacement: 'gojs/release/go' }],
  },
  test: {
    server: { deps: { inline: [/gojs/] } },
  },
});
