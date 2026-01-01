#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

async function postInstall() {
  try {
    console.log('🚀 LM Studio MCP Server - Post Installation Setup');
    
    // Check if we're in a Kiro workspace
    const isKiroWorkspace = await checkKiroWorkspace();
    
    if (isKiroWorkspace) {
      console.log('📁 Kiro workspace detected');
      
      // Offer to setup MCP integration
      console.log('🔧 Setting up Kiro MCP integration...');
      
      try {
        execSync('lm-studio-mcp-server --setup-kiro', { stdio: 'inherit' });
        console.log('✅ Kiro integration setup complete!');
      } catch (error) {
        console.log('⚠️  Automatic setup failed, you can run manually:');
        console.log('   lm-studio-mcp-server --setup-kiro');
      }
    } else {
      console.log('💡 To integrate with Kiro, run: lm-studio-mcp-server --setup-kiro');
    }
    
    console.log('\n🎉 Installation complete!');
    console.log('📖 Quick start:');
    console.log('   1. Start LM Studio with your preferred model');
    console.log('   2. Run: lm-studio-mcp-server');
    console.log('   3. The server will auto-discover and connect');
    console.log('\n🔍 For help: lm-studio-mcp-server --help');
    
  } catch (error) {
    console.error('❌ Post-install setup failed:', error.message);
    console.log('💡 You can still use the server manually');
  }
}

async function checkKiroWorkspace() {
  try {
    await fs.access('.kiro');
    return true;
  } catch {
    return false;
  }
}

// Only run if this is the main module (not being imported)
if (require.main === module) {
  postInstall();
}

module.exports = { postInstall };