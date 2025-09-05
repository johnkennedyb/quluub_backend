const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Starting backend optimization build...');

// Create dist directory if it doesn't exist
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
    console.log('✅ Created dist/ directory');
}

// Install terser for minification
try {
    console.log('📦 Installing terser for minification...');
    execSync('npm install terser --save-dev', { stdio: 'inherit' });
} catch (error) {
    console.log('⚠️  Terser already installed or installation failed, continuing...');
}

// Read and minify server.js
console.log('🔧 Minifying server.js...');
const serverContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

// Use terser to minify
try {
    const { minify } = require('terser');
    
    const minifyOptions = {
        compress: {
            drop_console: false, // Keep console logs for debugging
            drop_debugger: true,
            pure_funcs: ['console.debug'],
            passes: 2
        },
        mangle: {
            keep_fnames: true, // Keep function names for better debugging
            reserved: ['require', 'module', 'exports', '__dirname', '__filename']
        },
        format: {
            comments: false
        }
    };

    minify(serverContent, minifyOptions).then(result => {
        if (result.error) {
            console.error('❌ Minification error:', result.error);
            process.exit(1);
        }

        // Write minified server
        const minifiedPath = path.join(distDir, 'server.min.js');
        fs.writeFileSync(minifiedPath, result.code);
        
        // Calculate size reduction
        const originalSize = (serverContent.length / 1024).toFixed(2);
        const minifiedSize = (result.code.length / 1024).toFixed(2);
        const reduction = ((1 - result.code.length / serverContent.length) * 100).toFixed(1);
        
        console.log(`✅ Server minified: ${originalSize} KB → ${minifiedSize} KB (${reduction}% reduction)`);
        
        // Copy essential directories
        console.log('📁 Copying essential directories...');
        
        const dirsToCopy = [
            'config', 'controllers', 'middlewares', 'models', 
            'routes', 'services', 'utils', 'assets'
        ];
        
        dirsToCopy.forEach(dir => {
            const srcDir = path.join(__dirname, dir);
            const destDir = path.join(distDir, dir);
            
            if (fs.existsSync(srcDir)) {
                copyDirectory(srcDir, destDir);
                console.log(`✅ Copied ${dir}/`);
            }
        });
        
        // Create production package.json
        console.log('📄 Creating production package.json...');
        const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        
        // Production package.json with only runtime dependencies
        const prodPackageJson = {
            name: packageJson.name,
            version: packageJson.version,
            description: packageJson.description,
            main: 'server.min.js',
            scripts: {
                start: 'node server.min.js',
                'start:prod': 'NODE_ENV=production node server.min.js',
                'start:prod:win': 'set NODE_ENV=production && node server.min.js'
            },
            dependencies: packageJson.dependencies
        };
        
        fs.writeFileSync(
            path.join(distDir, 'package.json'), 
            JSON.stringify(prodPackageJson, null, 2)
        );
        
        // Create .env.production.template
        console.log('🔐 Creating .env.production.template...');
        const envTemplate = `# Production Environment Variables Template
# Copy this file to .env and fill in your production values

# Database Configuration
DB_HOST=your_production_db_host
DB_USER=your_production_db_user
DB_PASSWORD=your_production_db_password
DB_NAME=your_production_database_name

# Server Configuration
PORT=5000
NODE_ENV=production
JWT_SECRET=your_production_jwt_secret

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_production_google_client_id
GOOGLE_CLIENT_SECRET=your_production_google_client_secret

# Frontend URLs
CLIENT_URL=https://your-production-domain.com
FRONTEND_URL=https://your-production-domain.com

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_production_cloudinary_name
CLOUDINARY_API_KEY=your_production_cloudinary_key
CLOUDINARY_API_SECRET=your_production_cloudinary_secret

# Paystack Configuration
PAYSTACK_SECRET_API_KEY=sk_live_your_production_paystack_key

# Whereby Video Call API
WHEREBY_API_KEY=your_production_whereby_key
WALI_EMAILS=admin@yourdomain.com,wali@yourdomain.com

# Email Configuration (Production SMTP)
MAIL_USER=your_production_email@domain.com
MAIL_PASSWORD=your_production_email_password

EMAIL_USER=your_production_email@domain.com
EMAIL_PASS=your_production_email_password

SMTP_HOST=smtp.maileroo.com
SMTP_PORT=465
SMTP_SECURE=true`;
        
        fs.writeFileSync(path.join(distDir, '.env.production.template'), envTemplate);
        
        console.log('🎉 Build completed successfully!');
        console.log(`📦 Production files available in: ${distDir}`);
        console.log('🚀 Ready for deployment!');
        
    }).catch(error => {
        console.error('❌ Build failed:', error);
        process.exit(1);
    });
    
} catch (error) {
    console.error('❌ Terser not available, copying unminified files...');
    
    // Fallback: copy original server.js
    fs.copyFileSync(
        path.join(__dirname, 'server.js'),
        path.join(distDir, 'server.min.js')
    );
    console.log('⚠️  Using unminified server.js as fallback');
}

// Helper function to copy directories recursively
function copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const items = fs.readdirSync(src);
    
    items.forEach(item => {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);
        
        if (fs.statSync(srcPath).isDirectory()) {
            copyDirectory(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
}
