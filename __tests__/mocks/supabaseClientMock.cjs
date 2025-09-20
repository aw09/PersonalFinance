// CommonJS mock to replace @supabase/supabase-js in Jest tests
function makeQueryBuilder() {
  const qb = {}
  const methods = [
    'select','insert','update','delete','eq','neq','gt','gte','lt','lte','like','ilike','in','is','order','limit','range','single','maybeSingle'
  ]

  methods.forEach((m) => {
    if (typeof jest !== 'undefined' && typeof jest.fn === 'function') {
      qb[m] = jest.fn().mockReturnValue(qb)
    } else {
      qb[m] = () => qb
    }
  })

  return qb
}

function makeClient() {
  const queryBuilder = makeQueryBuilder()

  return {
    from: () => queryBuilder,
    auth: {
      getUser: () => Promise.resolve({ data: null, error: null }),
      getSession: () => Promise.resolve({ data: null, error: null }),
      signUp: () => Promise.resolve({ data: null, error: null }),
      signInWithPassword: () => Promise.resolve({ data: null, error: null }),
      signOut: () => Promise.resolve({ data: null, error: null }),
    },
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: null }),
        download: () => Promise.resolve({ data: null, error: null }),
        remove: () => Promise.resolve({ data: null, error: null }),
        list: () => Promise.resolve({ data: null, error: null }),
        getPublicUrl: () => ({ publicURL: '' }),
      })
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  }
}

module.exports = {
  createClient: function() {
    return makeClient()
  }
}
