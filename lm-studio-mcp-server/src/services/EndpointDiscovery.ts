import axios from 'axios';
import { getLogger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

export interface DiscoveryResult {
  endpoint: string;
  models: string[];
  responseTime: number;
}

export class EndpointDiscovery {
  private readonly logger = getLogger();
  private discoveredEndpoints: Map<string, DiscoveryResult> = new Map();

  async discoverLMStudioEndpoints(): Promise<DiscoveryResult[]> {
    this.logger.info('Starting comprehensive LM Studio endpoint discovery...');
    
    const candidates = this.generateEndpointCandidates();
    const results: DiscoveryResult[] = [];

    // Test all candidates in parallel with limited concurrency
    const batchSize = 5;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(endpoint => this.testEndpoint(endpoint))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
      }
    }

    // Sort by response time (fastest first)
    results.sort((a, b) => a.responseTime - b.responseTime);
    
    this.logger.info(`Discovery complete. Found ${results.length} active LM Studio instances`);
    return results;
  }

  async findBestEndpoint(): Promise<string | null> {
    const results = await this.discoverLMStudioEndpoints();
    
    if (results.length === 0) {
      this.logger.warn('No LM Studio endpoints discovered');
      return null;
    }

    const best = results[0];
    this.logger.info(`Best endpoint: ${best.endpoint} (${best.responseTime}ms, ${best.models.length} models)`);
    return best.endpoint;
  }

  private generateEndpointCandidates(): string[] {
    const candidates: string[] = [];
    
    // Common ports for LM Studio
    const ports = [1234, 8080, 3000, 5000, 8000, 9000, 11434];
    
    // Network interfaces to check
    const hosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      // Add common local network ranges
      ...this.generateLocalNetworkHosts()
    ];

    // Generate all combinations
    for (const host of hosts) {
      for (const port of ports) {
        candidates.push(`http://${host}:${port}`);
      }
    }

    // Add HTTPS variants for some
    for (const host of ['localhost', '127.0.0.1']) {
      for (const port of [1234, 8080]) {
        candidates.push(`https://${host}:${port}`);
      }
    }

    return candidates;
  }

  private generateLocalNetworkHosts(): string[] {
    const hosts: string[] = [];
    
    // Common local network ranges
    const ranges = [
      '192.168.1', '192.168.0', '192.168.2',
      '10.0.0', '10.0.1', '10.1.1',
      '172.16.0', '172.16.1'
    ];

    // Only check a few IPs per range to avoid being too aggressive
    for (const range of ranges) {
      for (let i = 1; i <= 10; i++) {
        hosts.push(`${range}.${i}`);
      }
    }

    return hosts;
  }

  private async testEndpoint(endpoint: string): Promise<DiscoveryResult | null> {
    try {
      const startTime = Date.now();
      
      const client = axios.create({
        baseURL: endpoint,
        timeout: 3000, // Short timeout for discovery
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Test if it's an LM Studio instance by checking the models endpoint
      const response = await client.get('/v1/models');
      const responseTime = Date.now() - startTime;
      
      if (response.status === 200 && response.data?.data) {
        const models = response.data.data.map((model: any) => model.id);
        
        const result: DiscoveryResult = {
          endpoint,
          models,
          responseTime
        };
        
        this.discoveredEndpoints.set(endpoint, result);
        this.logger.debug(`Found LM Studio at ${endpoint} with ${models.length} models (${responseTime}ms)`);
        
        return result;
      }
    } catch (error) {
      // Silently ignore failed endpoints during discovery
      this.logger.debug(`Endpoint ${endpoint} not accessible:`, error instanceof Error ? error.message : 'Unknown error');
    }
    
    return null;
  }

  async monitorEndpoint(endpoint: string, onStatusChange?: (isAvailable: boolean) => void): Promise<void> {
    const checkInterval = 30000; // 30 seconds
    let wasAvailable = false;

    const check = async () => {
      try {
        const result = await this.testEndpoint(endpoint);
        const isAvailable = result !== null;
        
        if (isAvailable !== wasAvailable) {
          this.logger.info(`Endpoint ${endpoint} status changed: ${isAvailable ? 'available' : 'unavailable'}`);
          wasAvailable = isAvailable;
          onStatusChange?.(isAvailable);
        }
      } catch (error) {
        this.logger.debug(`Monitoring check failed for ${endpoint}:`, error);
      }
    };

    // Initial check
    await check();
    
    // Set up periodic monitoring
    setInterval(check, checkInterval);
  }

  getDiscoveredEndpoints(): Map<string, DiscoveryResult> {
    return new Map(this.discoveredEndpoints);
  }

  async validateEndpoint(endpoint: string): Promise<boolean> {
    const result = await this.testEndpoint(endpoint);
    return result !== null;
  }
}