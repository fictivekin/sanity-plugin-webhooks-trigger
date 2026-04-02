import {AddIcon, ClockIcon, EditIcon, TrashIcon} from '@sanity/icons'
import {TokenIcon} from '@sanity/icons'
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
import {ReactElement, useCallback, useEffect, useState} from 'react'
import {useClient} from 'sanity'

import {buildWebhookRequestOptions, isGithubWebhookUrl} from './github-dispatch'
import WebhookFormModal from './modal'
import {decryptToken, encryptToken} from './security'
import {Webhook, WebhooksTriggerConfig} from './types'

const theme = buildTheme()
const WEBHOOK_TYPE = 'webhook_triggers'
const defaultText =
  'Trigger webhooks right from Sanity, whether you need to rebuild a static website after content edits or run any other automated process.'

const WebhooksTrigger = ({tool}: WebhooksTriggerConfig): ReactElement => {
  const {options} = tool
  const encryptionSalt = options.encryptionSalt

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
        await client.patch(webhook._id).set(webhook).commit()
      } else {
        // Create new webhook
        await client.create({
          _type: WEBHOOK_TYPE,
          _id: `${WEBHOOK_TYPE}.${customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 12)()}`,
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
   * Handle the Webhook triggering
   */
  const handleTriggerWebhook = useCallback(
    async (webhook: Webhook) => {
      if (webhook.url) {
        setTriggeringWebhook(webhook._id)

        try {
          const authToken =
            webhook.authToken && encryptionSalt
              ? decryptToken(webhook.authToken, encryptionSalt)
              : undefined

          const response = await fetch(
            webhook.url,
            buildWebhookRequestOptions({
              authToken,
              githubEventType: webhook.githubEventType || options.githubEventType,
              method: webhook.method,
              url: webhook.url,
            }),
          )

          await client
            .patch(webhook._id)
            .set({
              lastRunTime: new Date().toISOString(),
              lastRunStatus: response.ok ? 'success' : 'failed',
            })
            .commit()
        } catch (error) {
          console.error('Failed to trigger webhook:', error)

          await client
            .patch(webhook._id)
            .set({
              lastRunTime: new Date().toISOString(),
              lastRunStatus: 'failed',
            })
            .commit()
        }

        // Refresh the list to show updated status
        fetchWebhooks()
        setTriggeringWebhook(null)
      }
    },
    [client, fetchWebhooks, encryptionSalt, options.githubEventType],
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
                Deploy via Webhooks
              </Heading>
              <Text size={2} style={{maxWidth: '70ch'}}>
                {options.text || defaultText}
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
                              color={webhook.lastRunStatus === 'success' ? 'green' : 'red'}
                              style={{flexShrink: 0}}
                            />
                            <Text size={1} muted>
                              Last {webhook.lastRunStatus === 'success' ? 'successful' : 'failed'}{' '}
                              run: {new Date(webhook.lastRunTime).toLocaleString()}
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
                          >
                            {triggeringWebhook === webhook._id ? (
                              <Spinner size={1} />
                            ) : (
                              <Text size={1}>Trigger</Text>
                            )}
                          </Button>
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

              {options.triggerAll !== false && webhooks.length > 1 && (
                <Flex marginTop={4} justify="flex-end">
                  <Button
                    tone="positive"
                    onClick={handleTriggerAllWebhooks}
                    disabled={triggeringAll || triggeringWebhook !== null}
                  >
                    {triggeringAll ? <Spinner size={1} /> : <Text size={1}>Trigger All</Text>}
                  </Button>
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
