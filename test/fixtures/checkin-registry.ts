import dailyHealth from '../../layers/identity/server/checks/daily-health'
import dailyHealthCoverage from '../../layers/identity/server/checks/daily-health-coverage'

// Nitro owns discovery. Vitest exercises the same definitions and public runner.
export default [dailyHealth, dailyHealthCoverage]
