import { Account, Client, Databases } from 'appwrite'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint)
    .setProject(config.public.appwriteProjectId)

  const account = new Account(client)
  const databases = new Databases(client)

  return {
    provide: {
      appwrite: { client, account, databases }
    }
  }
})
