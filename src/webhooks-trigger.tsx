import {AddIcon, ClockIcon, EditIcon, TokenIcon, TrashIcon} from '@sanity/icons'
import {
  Box,
  Button,
  Card,
  Container,
  Flex,
  Heading,
  Spinner,
  Stack,
  Text,
  ThemeProvider,
} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {customAlphabet} from 'nanoid'
import {useCallback, useEffect, useState, type ReactElement} from 'react'
import {useClient} from 'sanity'

import {
  buildWebhookRequestOptions,
  DEFAULT_GITHUB_EVENT_TYPE,
  isGithubWebhookUrl,
} from './github-dispatch'
import WebhookFormModal from './modal'
import {decryptToken, encryptToken} from './security'
import {Webhook, WebhooksTriggerConfig} from './types'

const theme = buildTheme()
const WEBHOOK_TYPE = 'webhook_triggers'
const generateId = customAlphabet(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  12,
)
const defaultText =
  'Trigger webhooks right from Sanity, whether you need to rebuild a static website after content edits or run any other automated process.'

const RUN_STATUS_CONFIG = {
  success: {color: 'green', label: 'successful'},
  triggered: {color: 'orange', label: 'triggered'},
  failed: {color: 'red', label: 'failed'},
} as const

const WebhooksTrigger = ({tool}: WebhooksTriggerConfig): ReactElement => {
  const {options} = tool
  const {encryptionSalt, pageTitle, text, textForTriggerAll, githubEventType, triggerAll} = options
  const defaultGithubEventType = githubEventType || DEFAULT_GITHUB_EVENT_TYPE

  const client = useClient({apiVersion: '2021-06-07'})

  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [showModal, setShowModal] = useState(false)
  const [triggeringWebhook, setTriggeringWebhook] = useState<string | null>(null)
  const [triggeringAll, setTriggeringAll] = useState(false)
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null)
  const [deletingWebhook, setDeletingWebhook] = useState<string | null>(null)

  /**
   * Fetch all Webhooks
   */
  const fetchWebhooks = useCallback(async () => {
    const result = await client.fetch(`*[_type == "${WEBHOOK_TYPE}"]`)
    setWebhooks(result)
  }, [client])

  useEffect(() => {
    fetchWebhooks()
  }, [fetchWebhooks])

  /**
   * Handle the Webhook form submission
   */
  const handleSubmitWebhook = useCallback(
    async (webhook: Partial<Webhook>) => {
      if (!webhook.name || !webhook.url || !webhook.method) return

      if (webhook.authToken && encryptionSalt) {
        webhook.authToken = encryptToken(webhook.authToken, encryptionSalt)
      }

      if (webhook._id) {
        // Edit webhook
        let patch = client.patch(webhook._id).set(webhook)
        if (!webhook.githubEventType) {
          patch = patch.unset(['githubEventType'])
        }
        await patch.commit()
      } else {
        // Create new webhook
        await client.create({
          _type: WEBHOOK_TYPE,
          _id: `${WEBHOOK_TYPE}.${generateId()}`,
          ...webhook,
        })
      }

      setShowModal(false)
      setEditingWebhook(null)
      fetchWebhooks()
    },
    [client, fetchWebhooks, encryptionSalt],
  )

  /**
   * Close a modal
   */
  const handleCloseModal = useCallback(() => {
    setShowModal(false)
    setEditingWebhook(null)
  }, [])

  /**
   * Trigger a single webhook and record its status
   */
  const handleTriggerWebhook = useCallback(
    async (webhook: Webhook) => {
      if (!webhook.url) return
      setTriggeringWebhook(webhook._id)

      let lastRunStatus: Webhook['lastRunStatus'] = 'failed'

      try {
        const authToken =
          webhook.authToken && encryptionSalt
            ? decryptToken(webhook.authToken, encryptionSalt)
            : undefined

        // Non-GitHub endpoints rarely support CORS. buildWebhookRequestOptions
        // handles it with mode: 'no-cors', making the response opaque — so we
        // mark those as 'triggered' (sent successfully, outcome unknown).
        const isGithub = isGithubWebhookUrl(webhook.url)
        const response = await fetch(
          webhook.url,
          buildWebhookRequestOptions({
            authToken,
            githubEventType: webhook.githubEventType || defaultGithubEventType,
            payload: webhook.payload,
            method: webhook.method,
            url: webhook.url,
          }),
        )

        lastRunStatus = isGithub ? (response.ok ? 'success' : 'failed') : 'triggered'
      } catch (error) {
        console.error('Failed to trigger webhook:', error)
      }

      await client
        .patch(webhook._id)
        .set({lastRunTime: new Date().toISOString(), lastRunStatus})
        .commit()

      fetchWebhooks()
      setTriggeringWebhook(null)
    },
    [client, defaultGithubEventType, fetchWebhooks, encryptionSalt],
  )

  /**
   * Handle triggering all webhooks
   */
  const handleTriggerAllWebhooks = useCallback(async () => {
    setTriggeringAll(true)

    // Trigger all webhooks in sequence
    for (const webhook of webhooks) {
      await handleTriggerWebhook(webhook)
    }

    setTriggeringAll(false)
  }, [webhooks, handleTriggerWebhook])

  /**
   * Delete a Webhook
   */
  const handleDeleteWebhook = useCallback(
    async (webhook: Webhook) => {
      setDeletingWebhook(webhook._id)
      try {
        await client.delete(webhook._id)
        fetchWebhooks()
      } catch (error) {
        console.error('Failed to delete webhook:', error)
      } finally {
        setDeletingWebhook(null)
      }
    },
    [client, fetchWebhooks],
  )

  /**
   * Open modal for editing a webhook
   */
  const handleEditWebhook = useCallback((webhook: Webhook) => {
    setEditingWebhook(webhook)
    setShowModal(true)
  }, [])

  /**
   * Open modal for adding a new webhook
   */
  const handleAddWebhook = useCallback(() => {
    setShowModal(true)
  }, [])

  return (
    <ThemeProvider theme={theme}>
      <Container width={2}>
        {/* Intro text */}
        <Box padding={4} marginTop={5}>
          <Flex
            gap={4}
            align="flex-start"
            direction={['column', 'column', 'row']}
            justify={['flex-start', 'flex-start', 'space-between']}
          >
            <Stack space={4} style={{flex: 1, minWidth: 0}}>
              <Heading as="h2" size={3}>
                {pageTitle || 'Deploy via Webhooks'}
              </Heading>
              <Text size={2} style={{maxWidth: '70ch'}}>
                {text || defaultText}
              </Text>
            </Stack>

            <Box style={{flexShrink: 0}}>
              <Button icon={AddIcon} text="Add Webhook" tone="primary" onClick={handleAddWebhook} />
            </Box>
          </Flex>

          {/* Has items */}
          {webhooks.length > 0 ? (
            <>
              <Stack space={4} marginTop={[5, 5, 6]}>
                {webhooks.map((webhook) => (
                  <Card key={webhook._id} padding={3} radius={2} shadow={1}>
                    <Flex
                      align="flex-start"
                      direction={['column', 'column', 'row']}
                      justify={['flex-start', 'flex-start', 'space-between']}
                    >
                      <Stack space={1}>
                        <Heading as="h3" size={1} style={{marginBottom: '0.5em'}}>
                          {webhook.name}
                        </Heading>

                        <Box
                          style={{
                            display: 'grid',
                            gridTemplateColumns: `${webhook.authToken ? 'auto ' : ''}minmax(0, 1fr) auto`,
                            alignItems: 'center',
                            columnGap: 4,
                            width: '100%',
                          }}
                        >
                          {webhook.authToken && <TokenIcon fontSize={'1em'} />}
                          <Text size={1} muted title={webhook.url} textOverflow="ellipsis">
                            {webhook.url}
                          </Text>
                          <Text size={1} muted style={{whiteSpace: 'nowrap'}}>
                            ({webhook.method})
                          </Text>
                        </Box>

                        {isGithubWebhookUrl(webhook.url) && webhook.githubEventType && (
                          <Text size={1} muted>
                            GitHub event type: {webhook.githubEventType}
                          </Text>
                        )}

                        {webhook.lastRunTime && webhook.lastRunStatus && (
                          <Flex gap={1} align="center">
                            <ClockIcon
                              fontSize={'1em'}
                              color={RUN_STATUS_CONFIG[webhook.lastRunStatus].color}
                              style={{flexShrink: 0}}
                            />
                            <Text size={1} muted>
                              Last {RUN_STATUS_CONFIG[webhook.lastRunStatus].label} run:{' '}
                              {new Date(webhook.lastRunTime).toLocaleString()}
                            </Text>
                          </Flex>
                        )}
                      </Stack>

                      <Box marginTop={[3, 3, 0]}>
                        <Flex
                          gap={2}
                          wrap="wrap"
                          justify={['flex-start', 'flex-start', 'flex-end']}
                        >
                          <Button
                            tone="positive"
                            onClick={() => handleTriggerWebhook(webhook)}
                            disabled={triggeringWebhook === webhook._id}
                            text={triggeringWebhook === webhook._id ? undefined : 'Trigger'}
                            icon={triggeringWebhook === webhook._id ? Spinner : undefined}
                          />
                          <Button
                            icon={EditIcon}
                            tone="default"
                            onClick={() => handleEditWebhook(webhook)}
                          />
                          <Button
                            icon={deletingWebhook === webhook._id ? Spinner : TrashIcon}
                            tone="default"
                            onClick={() => handleDeleteWebhook(webhook)}
                            disabled={deletingWebhook === webhook._id}
                          />
                        </Flex>
                      </Box>
                    </Flex>
                  </Card>
                ))}
              </Stack>

              {triggerAll !== false && webhooks.length > 1 && (
                <Flex marginTop={4} justify="flex-end">
                  <Button
                    tone="positive"
                    onClick={handleTriggerAllWebhooks}
                    disabled={triggeringAll || triggeringWebhook !== null}
                    text={triggeringAll ? undefined : (textForTriggerAll || 'Trigger All')}
                    icon={triggeringAll ? Spinner : undefined}
                  />
                </Flex>
              )}
            </>
          ) : (
            // No items: Show a message with a button
            <Card padding={4} radius={2} shadow={1} marginTop={[5, 5, 6]}>
              <Flex direction="column" align="center" gap={3}>
                <Card paddingY={5}>
                  <Text>No webhook yet</Text>
                </Card>
                <Button
                  width="fill"
                  icon={AddIcon}
                  text="Add Webhook"
                  tone="primary"
                  onClick={handleAddWebhook}
                />
              </Flex>
            </Card>
          )}
        </Box>

        {showModal && (
          <WebhookFormModal
            defaultGithubEventType={defaultGithubEventType}
            webhook={editingWebhook || {}}
            onClose={handleCloseModal}
            onSubmit={handleSubmitWebhook}
            title={editingWebhook ? 'Edit Webhook' : 'Add New Webhook'}
          />
        )}
      </Container>
    </ThemeProvider>
  )
}

export default WebhooksTrigger
