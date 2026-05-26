/**
 * QuoterCard — HubSpot CRM UI Extension (App Card)
 * Sidebar card on Contact records.
 *
 * FocuxAI Engine™ — Focux Digital Group S.A.S.
 */

import { useState } from 'react';
import {
  hubspot,
  Text,
  Button,
  Link,
  Flex,
  Alert,
  LoadingSpinner,
} from '@hubspot/ui-extensions';

hubspot.extend(({ context, runServerlessFunction, actions }) => (
  <QuoterCard
    context={context}
    runServerless={runServerlessFunction}
    _sendAlert={actions.addAlert}
  />
));

const QuoterCard = ({ context, runServerless, _sendAlert }: any) => {
  const [launchUrl, setLaunchUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const portalId = context.portal.id;
  const userEmail = context.user.email;
  const contactId = context.crm.objectId;

  const handleLaunch = async () => {
    setLoading(true);
    setError(null);
    setLaunchUrl(null);

    try {
      const result = await runServerless({
        name: 'focux_quoter_card_app_function',
        parameters: {
          portalId: String(portalId),
          userEmail: String(userEmail),
          contactId: String(contactId),
        },
      });

      // Debug: show full response structure
      const resp = result?.response;

      if (resp && resp.status === 'SUCCESS' && resp.launchUrl) {
        setLaunchUrl(resp.launchUrl);
      } else {
        // Show actual error for debugging
        const msg = resp?.message
          || `Respuesta inesperada: ${JSON.stringify(result).substring(0, 200)}`;
        setError(msg);
      }
    } catch (err: any) {
      setError(`Error: ${err.message || JSON.stringify(err).substring(0, 200)}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Flex direction="column" align="center" gap="sm">
        <LoadingSpinner label="Preparando cotizador..." />
      </Flex>
    );
  }

  if (error) {
    return (
      <Flex direction="column" gap="sm">
        <Alert title="Error" variant="error">
          {error}
        </Alert>
        <Button onClick={handleLaunch} variant="primary">
          Reintentar
        </Button>
      </Flex>
    );
  }

  if (launchUrl) {
    return (
      <Flex direction="column" gap="sm">
        <Text format={{ fontWeight: 'bold' }}>Listo</Text>
        <Link href={launchUrl} external={true}>
          Abrir Cotizador
        </Link>
        <Button onClick={handleLaunch} variant="secondary" size="sm">
          Regenerar
        </Button>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="sm">
      <Button onClick={handleLaunch} variant="primary">
        Cotizar
      </Button>
    </Flex>
  );
};
