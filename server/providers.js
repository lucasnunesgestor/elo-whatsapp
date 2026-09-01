// Presets de ponto de partida. Documentação pública desses provedores muda
// entre versões de servidor — trate como um preenchimento inicial do
// formulário, nunca como verdade absoluta. Sempre confirme com o botão
// "Testar conexão" antes de gerar o link do cliente.
//
// {instance} nos paths é substituído pelo campo "Nome da instância" do
// cliente (necessário na Evolution API, que identifica a sessão pela URL).

const PRESETS = {
  uazapi: {
    label: 'UazAPI',
    connectPath: '/instance/connect',
    connectMethod: 'POST',
    statusPath: '/instance/status',
    statusMethod: 'GET',
    authHeader: 'token',
    authPrefix: '',
    qrJsonPath: 'instance.qrcode',
    statusJsonPath: 'instance.status',
    connectedValue: 'connected',
    needsInstanceName: false,
  },
  evolution: {
    label: 'Evolution API',
    connectPath: '/instance/connect/{instance}',
    connectMethod: 'GET',
    statusPath: '/instance/connectionState/{instance}',
    statusMethod: 'GET',
    authHeader: 'apikey',
    authPrefix: '',
    qrJsonPath: 'base64',
    statusJsonPath: 'instance.state',
    connectedValue: 'open',
    needsInstanceName: true,
  },
  wuzapi: {
    label: 'Wuzapi',
    connectPath: '/session/connect',
    connectMethod: 'POST',
    statusPath: '/session/status',
    statusMethod: 'GET',
    authHeader: 'Token',
    authPrefix: '',
    qrJsonPath: 'data.qrcode',
    statusJsonPath: 'data.connected',
    connectedValue: 'true',
    needsInstanceName: false,
  },
  custom: {
    label: 'Personalizado',
    connectPath: '',
    connectMethod: 'POST',
    statusPath: '',
    statusMethod: 'GET',
    authHeader: 'Authorization',
    authPrefix: '',
    qrJsonPath: '',
    statusJsonPath: '',
    connectedValue: '',
    needsInstanceName: false,
  },
};

const PROVIDER_KEYS = Object.keys(PRESETS);

function isConnectedValue(value, connectedValue) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return String(value) === String(connectedValue).toLowerCase();
  return String(value).trim().toLowerCase() === String(connectedValue).trim().toLowerCase();
}

module.exports = { PRESETS, PROVIDER_KEYS, isConnectedValue };
