#!/bin/bash

# Script to checkout and test a branch in the simulator

BRANCH_NAME=$1

if [ -z "$BRANCH_NAME" ]; then
    echo "Usage: ./checkout-branch.sh BRANCH_NAME"
    echo ""
    echo "Available remote branches:"
    git branch -r | grep -v HEAD
    exit 1
fi

echo "Fetching latest branches from GitHub..."
git fetch origin

echo ""
echo "Checking out branch: $BRANCH_NAME"
git checkout $BRANCH_NAME

if [ $? -eq 0 ]; then
    echo "✅ Successfully checked out $BRANCH_NAME"
    echo ""
    echo "Installing dependencies..."
    npm install
    echo ""
    echo "Starting Expo..."
    echo "Press 'i' for iOS simulator or 'a' for Android"
    npx expo start
else
    echo "❌ Failed to checkout branch. Make sure the branch name is correct."
    echo ""
    echo "Available branches:"
    git branch -r | grep -v HEAD
fi

