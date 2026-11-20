// Zod can compile a fast parser with `new Function`. The anatomy tool does not need the speed, so it turns that off.
// This module must be the first import of bin/anatomy.ts: imports run in order, and the setting must be in place
// before any schema module loads.
import { z } from 'zod'

z.config({ jitless: true })
