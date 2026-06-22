import type {ReactNode} from 'react'

export interface WebhooksTriggerOptions {
  name?: string
  icon?: ReactNode
  title?: string
  pageTitle?: string
  text?: string
  textForTriggerAll?: string
  encryptionSalt?: string
  githubEventType?: string
  triggerAll?: boolean
}

export interface WebhooksTriggerConfig {
  tool: {
    options: WebhooksTriggerOptions
  }
}

export interface Webhook {
  _id: string
  name: string | undefined
  url: string | undefined
  method: 'GET' | 'POST' | undefined
  authToken?: string
  payload?: string
  githubEventType?: string
  lastRunTime?: string
  lastRunStatus?: 'success' | 'failed' | 'triggered'
}

export interface WebhookFormModalProps {
  defaultGithubEventType: string
  webhook: Partial<Webhook>
  onClose: () => void
  onSubmit: (webhook: Partial<Webhook>) => void
  title: string
}
