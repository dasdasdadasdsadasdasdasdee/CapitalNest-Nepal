/**
 * Real-time Balance Sync Module
 * Listens to Supabase changes and updates UI in real-time
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';

class RealtimeBalanceSync {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.subscriptions = [];
    this.listeners = {};
    this.currentUserId = null;
  }

  /**
   * Initialize real-time subscriptions for a user
   */
  async init(userId) {
    this.currentUserId = userId;
    
    // Subscribe to transaction updates
    this.subscribeToTransactionUpdates(userId);
    
    // Subscribe to payment approvals
    this.subscribeToPaymentApprovals(userId);
    
    console.log('✅ Real-time sync initialized for user:', userId);
  }

  /**
   * Subscribe to transaction updates
   */
  subscribeToTransactionUpdates(userId) {
    const subscription = this.supabase
      .from('transactions')
      .on('UPDATE', (payload) => {
        if (payload.new.user_id === userId) {
          this.emit('transaction-updated', payload.new);
          console.log('📊 Transaction updated:', payload.new);
          
          // If transaction was approved, update balance
          if (payload.new.status === 'completed') {
            this.emit('transaction-completed', payload.new);
          }
        }
      })
      .subscribe();
    
    this.subscriptions.push(subscription);
  }

  /**
   * Subscribe to payment approval changes
   */
  subscribeToPaymentApprovals(userId) {
    const subscription = this.supabase
      .from('payment_approvals')
      .on('UPDATE', (payload) => {
        if (payload.new.user_id === userId) {
          this.emit('approval-updated', payload.new);
          console.log('🔔 Approval updated:', payload.new);
          
          if (payload.new.status === 'approved') {
            this.emit('payment-approved', payload.new);
          }
        }
      })
      .subscribe();
    
    this.subscriptions.push(subscription);
  }

  /**
   * Register event listener
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  /**
   * Emit event to all listeners
   */
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  /**
   * Get current balance for user
   */
  async getBalance() {
    return null;
  }

  /**
   * Get all transactions for user
   */
  async getTransactions(limit = 20) {
    try {
      const { data, error } = await this.supabase
        .from('transactions')
        .select('*')
        .eq('user_id', this.currentUserId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return [];
    }
  }

  /**
   * Get pending approvals for user
   */
  async getPendingApprovals() {
    try {
      const { data, error } = await this.supabase
        .from('payment_approvals')
        .select('*')
        .eq('user_id', this.currentUserId)
        .eq('status', 'pending');
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching pending approvals:', error);
      return [];
    }
  }

  /**
   * Create new payment approval request
   */
  async createPaymentRequest(amount, paymentMethod, notes = '') {
    try {
      const { data, error } = await this.supabase
        .from('payment_approvals')
        .insert([
          {
            user_id: this.currentUserId,
            amount,
            payment_method: paymentMethod,
            status: 'pending',
            notes
          }
        ])
        .select();
      
      if (error) throw error;
      this.emit('payment-request-created', data[0]);
      return data[0];
    } catch (error) {
      console.error('Error creating payment request:', error);
      throw error;
    }
  }

  /**
   * Cleanup subscriptions
   */
  unsubscribe() {
    this.subscriptions.forEach(sub => {
      this.supabase.removeSubscription(sub);
    });
    this.subscriptions = [];
    console.log('✅ All subscriptions cleaned up');
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.RealtimeBalanceSync = RealtimeBalanceSync;
}

export default RealtimeBalanceSync;
