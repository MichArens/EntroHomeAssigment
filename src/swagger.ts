export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'AWS Secrets Scanner API',
    version: '1.0.0',
    description: 'A REST API service that scans GitHub repositories for leaked AWS credentials in commit history.',
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Development server'
    }
  ],
  tags: [
    {
      name: 'Scans',
      description: 'Repository scanning operations'
    },
    {
      name: 'Health',
      description: 'Service health check'
    }
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check endpoint',
        description: 'Check if the service is running',
        responses: {
          200: {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      example: 'ok'
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/scan': {
      post: {
        tags: ['Scans'],
        summary: 'Start a new scan',
        description: 'Initiates a scan of a GitHub repository for AWS secrets. Returns immediately with a scan ID.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ScanRequest'
              },
              examples: {
                basic: {
                  summary: 'Basic scan',
                  value: {
                    repository: 'octocat/Hello-World'
                  }
                },
                withScanId: {
                  summary: 'Scan with custom ID (for resuming)',
                  value: {
                    repository: 'octocat/Hello-World',
                    scanId: 'my-custom-scan-id'
                  }
                }
              }
            }
          }
        },
        responses: {
          202: {
            description: 'Scan started successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: {
                      type: 'string',
                      example: 'Scan started'
                    },
                    scanId: {
                      type: 'string',
                      example: 'scan_1730217600_abc123'
                    },
                    statusUrl: {
                      type: 'string',
                      example: '/api/scan/scan_1730217600_abc123/status'
                    },
                    resultsUrl: {
                      type: 'string',
                      example: '/api/scan/scan_1730217600_abc123/results'
                    }
                  }
                }
              }
            }
          },
          400: {
            description: 'Invalid request or scan already in progress',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                },
                examples: {
                  invalidRepository: {
                    summary: 'Invalid repository format',
                    value: {
                      error: "Repository is required and must be in format 'owner/repo'"
                    }
                  },
                  scanInProgress: {
                    summary: 'Scan already running',
                    value: {
                      error: 'Scan already in progress',
                      scanId: 'scan_1730217600_abc123'
                    }
                  }
                }
              }
            }
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                }
              }
            }
          }
        }
      }
    },
    '/api/scan/{scanid}/status': {
      get: {
        tags: ['Scans'],
        summary: 'Get scan status',
        description: 'Get real-time status of an active or completed scan, including progress and elapsed time.',
        parameters: [
          {
            name: 'scanid',
            in: 'path',
            required: true,
            description: 'The unique scan identifier',
            schema: {
              type: 'string',
              example: 'scan_1730217600_abc123'
            }
          }
        ],
        responses: {
          200: {
            description: 'Scan status retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ScanStatus'
                },
                examples: {
                  inProgress: {
                    summary: 'Scan in progress',
                    value: {
                      status: 'in-progress',
                      progress: {
                        current: 50,
                        total: 150
                      },
                      findings: [
                        {
                          commit: 'a1b2c3d4e5f6',
                          commitUrl: 'https://github.com/octocat/Hello-World/commit/a1b2c3d4e5f6',
                          committer: 'octocat',
                          timestamp: '2025-01-15T10:05:30Z',
                          file: 'config/aws.yml',
                          line: 42,
                          leakValue: 'AKIAIOSFODNN7EXAMPLE',
                          leakType: 'AWS_ACCESS_KEY_ID'
                        }
                      ],
                      startTime: '2025-01-15T10:00:00Z',
                      elapsedTime: '5m 30s'
                    }
                  },
                  completed: {
                    summary: 'Scan completed',
                    value: {
                      status: 'completed',
                      progress: {
                        current: 150,
                        total: 150
                      },
                      findings: [],
                      startTime: '2025-01-15T10:00:00Z',
                      elapsedTime: '15m 30s'
                    }
                  }
                }
              }
            }
          },
          404: {
            description: 'Scan not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                },
                example: {
                  error: 'Scan not found'
                }
              }
            }
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                }
              }
            }
          }
        }
      }
    },
    '/api/scan/{scanid}/results': {
      get: {
        tags: ['Scans'],
        summary: 'Get scan results',
        description: 'Get complete results with all findings and timing information.',
        parameters: [
          {
            name: 'scanid',
            in: 'path',
            required: true,
            description: 'The unique scan identifier',
            schema: {
              type: 'string',
              example: 'scan_1730217600_abc123'
            }
          }
        ],
        responses: {
          200: {
            description: 'Scan results retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ScanResults'
                },
                example: {
                  scanId: 'scan_1730217600_abc123',
                  status: 'completed',
                  totalFindings: 2,
                  findings: [
                    {
                      commit: 'a1b2c3d4e5f6',
                      commitUrl: 'https://github.com/octocat/Hello-World/commit/a1b2c3d4e5f6',
                      committer: 'octocat',
                      timestamp: '2025-01-15T10:05:30Z',
                      file: 'config/aws.yml',
                      line: 42,
                      leakValue: 'AKIAIOSFODNN7EXAMPLE',
                      leakType: 'AWS_ACCESS_KEY_ID'
                    },
                    {
                      commit: 'b2c3d4e5f6a1',
                      commitUrl: 'https://github.com/octocat/Hello-World/commit/b2c3d4e5f6a1',
                      committer: 'developer',
                      timestamp: '2025-01-14T15:20:10Z',
                      file: 'src/config.js',
                      line: 15,
                      leakValue: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                      leakType: 'AWS_SECRET_ACCESS_KEY'
                    }
                  ],
                  startTime: '2025-01-15T10:00:00Z',
                  endTime: '2025-01-15T10:15:30Z',
                  duration: '15m 30s',
                  resultsFile: '/app/results/scan_scan_1730217600_abc123_results.json'
                }
              }
            }
          },
          404: {
            description: 'Scan not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                },
                example: {
                  error: 'Scan not found'
                }
              }
            }
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                }
              }
            }
          }
        }
      }
    },
    '/api/scan/{scanid}': {
      delete: {
        tags: ['Scans'],
        summary: 'Delete scan data',
        description: 'Clear scan data from Redis. This does NOT delete the results file.',
        parameters: [
          {
            name: 'scanid',
            in: 'path',
            required: true,
            description: 'The unique scan identifier',
            schema: {
              type: 'string',
              example: 'scan_1730217600_abc123'
            }
          }
        ],
        responses: {
          200: {
            description: 'Scan data deleted successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: {
                      type: 'string',
                      example: 'Scan data deleted'
                    },
                    scanId: {
                      type: 'string',
                      example: 'scan_1730217600_abc123'
                    }
                  }
                }
              }
            }
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                }
              }
            }
          }
        }
      }
    },
    '/api/results': {
      get: {
        tags: ['Scans'],
        summary: 'List all scans',
        description: 'Get a list of all available scan IDs from both Redis (active) and file system (completed).',
        responses: {
          200: {
            description: 'List of scan IDs retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    scanIds: {
                      type: 'array',
                      items: {
                        type: 'string'
                      },
                      example: [
                        'scan_1730217600_abc123',
                        'scan_1730218000_def456',
                        'my-custom-scan-id'
                      ]
                    }
                  }
                }
              }
            }
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      ScanRequest: {
        type: 'object',
        required: ['repository'],
        properties: {
          repository: {
            type: 'string',
            description: "GitHub repository in format 'owner/repo'",
            example: 'octocat/Hello-World'
          },
          scanId: {
            type: 'string',
            description: 'Optional custom scan ID. If not provided, one will be generated. Use for resuming interrupted scans.',
            example: 'my-custom-scan-id'
          }
        }
      },
      ScanStatus: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['in-progress', 'completed', 'failed'],
            description: 'Current status of the scan'
          },
          progress: {
            type: 'object',
            properties: {
              current: {
                type: 'number',
                description: 'Number of commits processed',
                example: 50
              },
              total: {
                type: 'number',
                description: 'Total number of commits to scan',
                example: 150
              }
            }
          },
          findings: {
            type: 'array',
            description: 'All findings discovered so far',
            items: {
              $ref: '#/components/schemas/Finding'
            }
          },
          startTime: {
            type: 'string',
            format: 'date-time',
            description: 'ISO 8601 timestamp when scan started',
            example: '2025-01-15T10:00:00Z'
          },
          elapsedTime: {
            type: 'string',
            description: 'Human-readable elapsed time',
            example: '5m 30s'
          }
        }
      },
      ScanResults: {
        type: 'object',
        properties: {
          scanId: {
            type: 'string',
            description: 'Unique scan identifier',
            example: 'scan_1730217600_abc123'
          },
          status: {
            type: 'string',
            description: 'Final status of the scan'
          },
          totalFindings: {
            type: 'number',
            description: 'Total number of secrets found',
            example: 3
          },
          findings: {
            type: 'array',
            description: 'All detected secrets',
            items: {
              $ref: '#/components/schemas/Finding'
            }
          },
          startTime: {
            type: 'string',
            format: 'date-time',
            description: 'ISO 8601 timestamp when scan started',
            example: '2025-01-15T10:00:00Z'
          },
          endTime: {
            type: 'string',
            format: 'date-time',
            description: 'ISO 8601 timestamp when scan completed',
            example: '2025-01-15T10:15:30Z'
          },
          duration: {
            type: 'string',
            description: 'Human-readable duration',
            example: '15m 30s'
          },
          resultsFile: {
            type: 'string',
            description: 'Path to the JSON results file',
            example: '/app/results/scan_scan_1730217600_abc123_results.json'
          }
        }
      },
      Finding: {
        type: 'object',
        description: 'A detected AWS secret in a commit',
        properties: {
          commit: {
            type: 'string',
            description: 'Git commit SHA',
            example: 'a1b2c3d4e5f6'
          },
          commitUrl: {
            type: 'string',
            description: 'Direct link to commit on GitHub',
            example: 'https://github.com/octocat/Hello-World/commit/a1b2c3d4e5f6'
          },
          committer: {
            type: 'string',
            description: 'Name and email of the committer',
            example: 'octocat <octocat@github.com>'
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'When the commit was made',
            example: '2025-01-15T10:05:30Z'
          },
          file: {
            type: 'string',
            description: 'Path to the file containing the secret',
            example: 'config/aws.yml'
          },
          line: {
            type: 'number',
            description: 'Line number where secret was found',
            example: 42
          },
          leakValue: {
            type: 'string',
            description: 'The actual secret value detected',
            example: 'AKIAIOSFODNN7EXAMPLE'
          },
          leakType: {
            type: 'string',
            description: 'Type of AWS credential detected',
            enum: [
              'AWS_ACCESS_KEY_ID',
              'AWS_SECRET_ACCESS_KEY',
              'AWS_SECRET_ACCESS_KEY_PATTERN',
              'AWS_SESSION_TOKEN',
              'AWS_ACCOUNT_ID',
              'AWS_MWS_KEY'
            ],
            example: 'AWS_ACCESS_KEY_ID'
          }
        }
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            description: 'Error message',
            example: 'Scan not found'
          },
          message: {
            type: 'string',
            description: 'Detailed error message (for 500 errors)'
          }
        }
      }
    }
  }
};

