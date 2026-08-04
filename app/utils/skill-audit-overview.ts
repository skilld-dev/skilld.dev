export interface SkillAudit {
  provider: string
  slug: string
  status: 'pass' | 'warn' | 'fail' | string
  summary?: string
  auditedAt?: string
  riskLevel?: string
}

export interface SkillAuditOverview {
  icon: string
  tone: 'success' | 'warning' | 'error'
  label: string
  detail: string
  latestAuditedAt?: string
}

export function resolveSkillAuditOverview(audits: SkillAudit[]): SkillAuditOverview | null {
  if (!audits.length)
    return null

  const statuses = audits.map(audit => audit.status.toLowerCase())
  const failed = statuses.filter(status => status === 'fail').length
  const warned = statuses.filter(status => status === 'warn').length
  const passed = statuses.filter(status => status === 'pass').length
  const latestAuditedAt = audits
    .map(audit => audit.auditedAt)
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
  const riskLevel = audits.find(audit => audit.riskLevel)?.riskLevel?.toUpperCase()
  const detail = `${audits.length} check${audits.length === 1 ? '' : 's'}${riskLevel ? ` · Risk ${riskLevel}` : ''}`

  if (failed > 0) {
    return {
      icon: 'i-lucide-shield-x',
      tone: 'error',
      label: `${failed} alert${failed === 1 ? '' : 's'}`,
      detail,
      latestAuditedAt,
    }
  }

  if (warned > 0) {
    return {
      icon: 'i-lucide-shield-alert',
      tone: 'warning',
      label: `${warned} warning${warned === 1 ? '' : 's'}`,
      detail,
      latestAuditedAt,
    }
  }

  if (passed !== audits.length) {
    return {
      icon: 'i-lucide-shield-alert',
      tone: 'warning',
      label: 'Review needed',
      detail,
      latestAuditedAt,
    }
  }

  return {
    icon: 'i-lucide-shield-check',
    tone: 'success',
    label: 'No alerts',
    detail,
    latestAuditedAt,
  }
}
