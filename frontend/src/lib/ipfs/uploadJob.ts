// Pinata uploader for job descriptions.
//
// We use fetch instead of axios — one fewer dependency, native to the browser,
// and a hot path on the critical user flow ("post job"), so smaller is better.

export interface JobData {
  title: string
  description: string
  skills: string[]
  budget_text: string
  // Optional: GitHub URL for the Web2 bridge. Builders attach this in their
  // application payload, not here — included for client-posted reference work.
  reference_url?: string
}

export interface UploadResult {
  cid: string
  pinSize: number
  timestamp: string
}

const PINATA_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS'

export const uploadJobToIPFS = async (jobData: JobData): Promise<UploadResult> => {
  const jwt = import.meta.env.VITE_PINATA_JWT
  if (!jwt) {
    throw new Error('VITE_PINATA_JWT is not set. Copy .env.example to .env.local and add a Pinata JWT.')
  }

  const response = await fetch(PINATA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      pinataContent: jobData,
      pinataMetadata: {
        name: `ChainTask_Job_${Date.now()}.json`,
        keyvalues: {
          app: 'chaintask',
          type: 'job',
        },
      },
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Pinata upload failed (${response.status}): ${detail || response.statusText}`)
  }

  const data: { IpfsHash: string; PinSize: number; Timestamp: string } = await response.json()

  return {
    cid: data.IpfsHash,
    pinSize: data.PinSize,
    timestamp: data.Timestamp,
  }
}

// Fetch a job description back from IPFS by CID.
// Always reads from the gateway, never from a backend cache — the on-chain CID
// is the source of truth, and a malicious frontend serving doctored content
// would be detectable by anyone running their own gateway.
export const fetchJobFromIPFS = async (cid: string): Promise<JobData> => {
  const gateway = `https://gateway.pinata.cloud/ipfs/${cid}`
  const response = await fetch(gateway)
  if (!response.ok) {
    throw new Error(`Failed to fetch job ${cid}: ${response.statusText}`)
  }
  return response.json()
}
