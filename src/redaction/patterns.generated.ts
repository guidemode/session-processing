// Generated from patterns.json by scripts/generate-patterns.mjs — do not edit by hand.
import type { RedactionPattern } from './patterns.js'

export const patternsData: RedactionPattern[] = [
  {
    "name": "AWSAccessKeyId",
    "pattern": "\\b(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\\b",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "AWSSecretKey",
    "pattern": "(?:AWS|aws|Aws)?_?(?:SECRET|secret|Secret)?_?(?:ACCESS|access|Access)?_?(?:KEY|key|Key)\\s*[=:]\\s*['\"]?([A-Za-z0-9/+=]{40})['\"]?",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": 1,
    "replacement": null
  },
  {
    "name": "PrivateKey",
    "pattern": "-----BEGIN[ ]?(?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----",
    "caseInsensitive": false,
    "multiline": true,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "NPMToken",
    "pattern": "\\bnpm_[A-Za-z0-9_]{36}\\b",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "NPMAuthToken",
    "pattern": "_authToken=([^$\\s].*)",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": 1,
    "replacement": null
  },
  {
    "name": "BasicAuth",
    "pattern": "(?:https?|ftp|ftps)://[^:/?#\\s]+:[^@/?#\\s]+@[^/?#\\s]+",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "SlackToken",
    "pattern": "\\b(?:xoxb|xoxp|xapp|xoxa|xoxr|xoxo|xoxs)-[A-Za-z0-9-]{10,250}\\b",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "SlackWebhook",
    "pattern": "https://hooks\\.slack\\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[A-Za-z0-9]+",
    "caseInsensitive": true,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "SendGridKey",
    "pattern": "\\bSG\\.[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}\\b",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "ShopifyToken",
    "pattern": "\\b(?:shppa|shpca|shpat|shpss)_[a-zA-Z0-9]{32,64}\\b",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "GitHubToken",
    "pattern": "\\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36}\\b",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "GitHubFineGrainedToken",
    "pattern": "\\bgithub_pat_[A-Za-z0-9_]{82}\\b",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "OpenAIToken",
    "pattern": "\\bsk-[a-zA-Z0-9]{20}T3BlbkFJ[a-zA-Z0-9]{20}\\b",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "OpenAIProjectToken",
    "pattern": "\\bsk-(?:proj|svcacct|admin)-[a-zA-Z0-9_-]{20,}T3BlbkFJ[a-zA-Z0-9_-]{20,}\\b",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "AnthropicKey",
    "pattern": "\\bsk-ant-api0\\d-[A-Za-z0-9_-]{90,128}AA\\b",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "LinearToken",
    "pattern": "\\blin_api_[a-zA-Z0-9_]{32,128}\\b",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "OnePasswordToken",
    "pattern": "\\bops_ey[A-Za-z0-9+/=]{100,1280}\\b",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "MongoDBURL",
    "pattern": "mongodb(?:\\+srv)?://[^:/?#\\s]+:[^@/?#\\s]+@[^/?#\\s]+",
    "caseInsensitive": true,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "MySQLURL",
    "pattern": "(?:jdbc:)?mysql(?:x)?://[^:/?#\\s]+:[^@/?#\\s]+@[^/?#\\s]+",
    "caseInsensitive": true,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "PostgreSQLURL",
    "pattern": "postgres(?:ql)?://[^:/?#\\s]+:[^@/?#\\s]+@[^/?#\\s]+",
    "caseInsensitive": true,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "HOME_DIR",
    "pattern": "(?:/Users/[^/\\s\"']+|/home/[^/\\s\"']+)",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": null,
    "replacement": "~"
  },
  {
    "name": "EMAIL",
    "pattern": "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "API_KEY",
    "pattern": "\\bgai_[0-9a-f]{40,}\\b",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  },
  {
    "name": "SECRET_TOKEN",
    "pattern": "\\b(?:token|bearer|api[_-]?key|secret|password)\\s*[:=]\\s*['\"]?([A-Za-z0-9_\\-./+=]{32,})['\"]?",
    "caseInsensitive": true,
    "multiline": false,
    "captureGroup": 1,
    "replacement": null
  },
  {
    "name": "GCPServiceAccountKey",
    "pattern": "\"type\"\\s*:\\s*\"service_account\"",
    "caseInsensitive": false,
    "multiline": false,
    "captureGroup": null,
    "replacement": null
  }
]
