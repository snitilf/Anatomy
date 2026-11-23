// Zod can compile a fast parser with `new Function`. The anatomy tool does not need the speed, so it turns that off.
// The app turns it off too, because its Content Security Policy blocks `new Function`.
// This module must be the first import of bin/anatomy.ts and of src/main.tsx: imports run in order, and the setting must be in place
// before any schema module loads.
import { z } from 'zod'

z.config({ jitless: true })
