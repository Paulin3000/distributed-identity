
const { addToBitmap, getBitmapData, getStaticAccData, checkInclusionBitmap, checkInclusionGlobal } = require("../utilities/bitmap");
const { hashToPrime } = require("../utilities/accumulator");

// issuer function 
async function revoke(credential, subAccInstance, accInstance) {
    // credential is represented by a prime and stored at the local device of user, computed once the credential issued
    // issuer does not know prime, so it is computed before revocation 
    let [ credentialPrime, nonce ] = hashToPrime(credential, 128, 0n); 
    // when issuer revokes a credential, it is always added to the bitmap, issuer does not know which one 
    await addToBitmap(subAccInstance, accInstance, credentialPrime); 
}


// verifier function 
async function verify(credential, epoch, subAccInstance, accInstance) {
    let [ currentBitmap, hashCount, count, capacity, currentEpoch ] = await getBitmapData(subAccInstance); 
	let [ credentialPrime, nonce ] = hashToPrime(credential, 128, 0n); 

    // if currentEpoch == epoch provided
    if (currentEpoch.toNumber() === epoch) {
        // only check the inclusion in the current bitmap 
        let checkCurrentBitmap = await checkInclusionBitmap(subAccInstance, currentBitmap, hashCount, credentialPrime);
        // the credential has been revoked 
        if (checkCurrentBitmap === true) { return false; } 
    }
    // if currentEpoch != epoch 
    else {
        // retrieve bitmap and corresponding staticAcc based on provided epoch
        let [ pastBitmap, pastStaticAcc ] = await getStaticAccData(accInstance, epoch); 

        // check the inclusion of provided credential with retrieved bitmap (inclusion in corresponding bitmap)
        let checkRelatedBitmap = await checkInclusionBitmap(subAccInstance, pastBitmap, hashCount, credentialPrime); 
        // true if cred included in bitmap, the credential has been revoked 
        if (checkRelatedBitmap === true) { return false; } 

        // if the previous check returns false, the credential not in the bitmap retrieved though provided epoch 
        // check the inclusion of the static accumulator in the global accumulator to verify its reliability 
        let checkStaticAcc = await checkInclusionGlobal(accInstance, pastStaticAcc, epoch); 

        // the bitmap is not part of global accumulator, thus can't trust provided credential and corresponding acc
        if (checkStaticAcc === false) { return false; } 

        // if the previous check returns true, the static acc is a member of global acc and can be trusted 
        // check the subsequent bitmaps for credential exclusion and verify their membership in global acc 
        for (let i = epoch + 1; i < currentEpoch.toNumber(); i++) {
            // check all the bitmaps up to the current as its a special case to verify 
            // retrieve bitmap and static acc for the epoch i 
            let [ pastBitmap_i, pastStaticAcc_i ] = await getStaticAccData(accInstance, i); 
            // check the inclusion of the credential in that bitmap in epoch i 
            let checkSubsequent = await checkInclusionBitmap(subAccInstance, pastBitmap_i, hashCount, credentialPrime);
            // if the inclusion check return true, then credential has been revoked in subsequent epoch i 
            if (checkSubsequent === true) { return false; }
            
            // if the return false, the credential was not included in bitmap i, verify the correctness of that bitmap 
            let checkSubsequentAcc = await checkInclusionGlobal(accInstance, pastStaticAcc_i, i)
            // if yields false, then bitmap value was not part of the history and possibly forged 
            if (checkSubsequentAcc === false) { return false; }
            
            // if previous returns true, the bitmap is part of global accumulator and thus history 
        }

        // check the current bitmap separately since it does not have corresponding static acc yet 
        [ currentBitmap, hashCount, count, capacity, epoch ]  = await getBitmapData(subAccInstance); 
        // check the inclusion of the credential in current bitmap 
        let checkCurrBitmap = await checkInclusionBitmap(subAccInstance, currentBitmap, hashCount, credentialPrime);
        // the credential has been revoked 
        if (checkCurrBitmap === true) { return false; } 
    }

    // all the checks passed and credential is valid
    return true; 
}

module.exports = { revoke, verify }