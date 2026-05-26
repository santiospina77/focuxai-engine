/**
 * App Function: launchQuoter
 *
 * Called by the QuoterCard UI Extension when an asesor clicks "Cotizar".
 * Receives HubSpot context (portalId, userEmail, contactId) and calls
 * the Focux Engine to generate a signed launch token.
 *
 * Returns the full launch URL for the quoter.
 *
 * Secret: FOCUX_LAUNCH_SECRET (configured in HubSpot project secrets)
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 * Focux Digital Group S.A.S.
 */

const axios = require('axios');

const ENGINE_BASE_URL = 'https://engine.focux.co';

exports.main = async (context = {}) => {
  const contextKeys = Object.keys(context);

  // Secrets may live at different paths depending on platform version
  const secrets = context.secrets || context.event?.secrets || {};
  const parameters = context.parameters || context.event?.parameters || {};

  const { portalId, userEmail, contactId } = parameters;

  if (!portalId || !userEmail || !contactId) {
    return {
      status: 'ERROR',
      message: `Faltan datos. params=${JSON.stringify(parameters)}. keys=[${contextKeys}]`,
    };
  }

  const launchSecret = secrets.FOCUX_LAUNCH_SECRET
    || process.env.FOCUX_LAUNCH_SECRET;

  if (!launchSecret) {
    return {
      status: 'ERROR',
      message: `Secret not found. secretKeys=[${Object.keys(secrets)}]. ctxKeys=[${contextKeys}]. env=[${Object.keys(process.env).filter(k => k.includes('FOCUX')||k.includes('SECRET'))}]`,
    };
  }

  // ── Call Focux Engine to generate launch token ──
  try {
    const response = await axios.post(
      `${ENGINE_BASE_URL}/api/engine/quoter/launch-token`,
      {
        portalId: String(portalId),
        contactId: String(contactId),
        userEmail: String(userEmail),
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${launchSecret}`,
        },
        timeout: 10000,
      },
    );

    if (response.data && response.data.token) {
      return {
        status: 'SUCCESS',
        launchUrl: `${ENGINE_BASE_URL}/quoter/launch?token=${response.data.token}`,
      };
    }

    return {
      status: 'ERROR',
      message: 'Engine no retornó token válido.',
    };
  } catch (err) {
    const errMsg = err.response
      ? `Engine respondió ${err.response.status}: ${JSON.stringify(err.response.data)}`
      : err.message;

    console.error('[launchQuoter] Error:', errMsg);

    return {
      status: 'ERROR',
      message: `Error conectando con Focux Engine: ${errMsg}`,
    };
  }
};
