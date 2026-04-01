// Minimal entry point used as a subprocess by config.test.ts.
// Importing config triggers validateConfig() at module load time.
// Exits 0 on success; config.ts calls process.exit(1) on any validation failure.
import '../src/config.js'
