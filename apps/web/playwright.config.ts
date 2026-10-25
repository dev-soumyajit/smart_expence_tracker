import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests', timeout:180000, expect:{timeout:15000}, workers:1, retries:0,
  use:{baseURL:'http://localhost:3000',headless:true,actionTimeout:15000,navigationTimeout:30000,viewport:{width:1440,height:1000},screenshot:'only-on-failure'},
  outputDir:'../../.artifacts/playwright',
});
