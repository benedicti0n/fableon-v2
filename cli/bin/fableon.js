#!/usr/bin/env node
import { main } from '../src/index.js';

main().catch((e) => { console.error(`fableon: ${e.message}`); process.exit(1); });
