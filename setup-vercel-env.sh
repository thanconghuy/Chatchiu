#!/bin/bash
# Script to add environment variables to Vercel

echo "Setting up Vercel environment variables..."

# Add ACCESSTRADE_ACCESS_TOKEN
echo "1BIuwwkzn1ZIOiUS0rKv_cokkVKq_9f4" | vercel env add ACCESSTRADE_ACCESS_TOKEN production
echo "1BIuwwkzn1ZIOiUS0rKv_cokkVKq_9f4" | vercel env add ACCESSTRADE_ACCESS_TOKEN preview
echo "1BIuwwkzn1ZIOiUS0rKv_cokkVKq_9f4" | vercel env add ACCESSTRADE_ACCESS_TOKEN development

# Add ACCESSTRADE_API_TOKEN
echo "1BIuwwkzn1ZIOiUS0rKv_cokkVKq_9f4" | vercel env add ACCESSTRADE_API_TOKEN production
echo "1BIuwwkzn1ZIOiUS0rKv_cokkVKq_9f4" | vercel env add ACCESSTRADE_API_TOKEN preview
echo "1BIuwwkzn1ZIOiUS0rKv_cokkVKq_9f4" | vercel env add ACCESSTRADE_API_TOKEN development

# Add DATABASE_URL
echo "postgresql://neondb_owner:npg_KZt0IpRsEf5C@ep-steep-surf-adjmtiy6-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require" | vercel env add DATABASE_URL production
echo "postgresql://neondb_owner:npg_KZt0IpRsEf5C@ep-steep-surf-adjmtiy6-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require" | vercel env add DATABASE_URL preview
echo "postgresql://neondb_owner:npg_KZt0IpRsEf5C@ep-steep-surf-adjmtiy6-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require" | vercel env add DATABASE_URL development

# Add JWT_SECRET
echo "cashback-secret-key-change-in-production-2024" | vercel env add JWT_SECRET production
echo "cashback-secret-key-change-in-production-2024" | vercel env add JWT_SECRET preview
echo "cashback-secret-key-change-in-production-2024" | vercel env add JWT_SECRET development

# Add JWT_EXPIRES_IN
echo "7d" | vercel env add JWT_EXPIRES_IN production
echo "7d" | vercel env add JWT_EXPIRES_IN preview
echo "7d" | vercel env add JWT_EXPIRES_IN development

# Add COMMISSION_SPLIT
echo "0.7" | vercel env add COMMISSION_SPLIT production
echo "0.7" | vercel env add COMMISSION_SPLIT preview
echo "0.7" | vercel env add COMMISSION_SPLIT development

echo "Done! Now redeploy with: vercel --prod"
