import {Box, Button, Dialog, Grid, Label, Select, Spinner, Stack, Text, TextInput} from '@sanity/ui'
import {FormEvent, ReactElement, useCallback, useState} from 'react'

import {isGithubWebhookUrl} from './github-dispatch'
import {Webhook, WebhookFormModalProps} from './types'

const WebhookFormModal = ({
  defaultGithubEventType,
  webhook,
  onSubmit,
  onClose,
  title,
}: WebhookFormModalProps): ReactElement => {
  const [name, setName] = useState<Webhook['name']>(webhook.name || undefined)
  const [url, setUrl] = useState<Webhook['url']>(webhook.url || undefined)
  const [method, setMethod] = useState<Webhook['method']>(webhook.method || undefined)
  const [authToken, setAuthToken] = useState<Webhook['authToken']>(webhook.authToken || undefined)
  const [githubEventType, setGithubEventType] = useState<Webhook['githubEventType']>(
    webhook.githubEventType || undefined,
  )
  const [payload, setPayload] = useState<Webhook['payload']>(webhook.payload || undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const showGithubEventType = isGithubWebhookUrl(url)

  const buttonText = webhook._id ? 'Save changes' : 'Add Webhook'

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()

      setIsSubmitting(true)

      const updatedWebhook: Partial<Webhook> = {
        ...webhook,
        name,
        url,
        method,
        ...(authToken && {authToken}),
        ...(githubEventType && {githubEventType}),
        ...(payload && {payload}),
      }

      await onSubmit(updatedWebhook)

      setIsSubmitting(false)
    },
    [authToken, githubEventType, method, name, payload, onSubmit, url, webhook],
  )

  return (
    <Dialog header={title} id="webhook-form-dialog" onClose={onClose} width={1} zOffset={1000}>
      <Box padding={4}>
        <form onSubmit={handleSubmit}>
          <Stack space={4}>
            <Stack space={3}>
              <Label htmlFor="webhook-name">Name</Label>
              <TextInput
                id="webhook-name"
                value={name}
                placeholder="Cloudflare: Development, GH Action: Production…"
                required
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </Stack>

            <Stack space={3}>
              <Label htmlFor="webhook-url">Webhook URL</Label>
              <TextInput
                id="webhook-url"
                type="url"
                value={url}
                placeholder="https://provider.tld/webhook/url"
                required
                onChange={(event) => setUrl(event.currentTarget.value)}
              />
            </Stack>

            <Grid columns={[1, 1, 2]} gap={4}>
              <Stack space={3}>
                <Label htmlFor="webhook-method">Method</Label>
                <Select
                  id="webhook-method"
                  value={method}
                  required
                  onChange={(event) => setMethod(event.currentTarget.value as 'GET' | 'POST')}
                >
                  <option value="" />
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                </Select>
              </Stack>
              <Stack space={3}>
                <Label htmlFor="webhook-auth-token">Auth Token (Optional)</Label>
                <TextInput
                  id="webhook-auth-token"
                  type="password"
                  value={authToken}
                  placeholder="sk-abc123…"
                  onChange={(event) => setAuthToken(event.currentTarget.value)}
                />
              </Stack>
            </Grid>

            {method == "POST" && (
            <Stack space={3}>
              <Label htmlFor="json-payload">
                Payload (JSON format, optional)
              </Label>
              <TextInput
                id="json-payload"
                type="text"
                value={payload}
                placeholder='{"key":"value"}'
                onChange={(event) => setPayload(event.currentTarget.value)}
              />
            </Stack>
            )}

            {showGithubEventType && (payload == null || payload.trim() == "") && (
              <Stack space={3}>
                <Label htmlFor="webhook-github-event-type">GitHub Event Type (Optional)</Label>
                <TextInput
                  id="webhook-github-event-type"
                  value={githubEventType}
                  placeholder={defaultGithubEventType}
                  onChange={(event) => setGithubEventType(event.currentTarget.value || undefined)}
                />
                <Text size={1} muted>
                  Used for GitHub repository dispatch requests. Only used if `payload` is NOT set. If omitted (and `payload` is not set), this webhook uses
                  {defaultGithubEventType}.
                </Text>
              </Stack>
            )}

            <Button
              type="submit"
              text={isSubmitting ? undefined : buttonText}
              textAlign="center"
              justify="center"
              tone="primary"
              icon={isSubmitting ? Spinner : undefined}
              disabled={isSubmitting}
              style={{minHeight: 33}}
            />
          </Stack>
        </form>
      </Box>
    </Dialog>
  )
}

export default WebhookFormModal
