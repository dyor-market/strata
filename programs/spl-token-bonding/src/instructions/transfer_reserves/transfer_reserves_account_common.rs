// File has weird name because https://github.com/project-serum/anchor/issues/1499
// TODO: Rename to account.rs
use crate::{error::ErrorCode, state::*};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
pub struct TransferReservesV0Common<'info> {
  #[account(
    mut,
    constraint = token_bonding.reserve_authority.ok_or(error!(ErrorCode::NoAuthority))? == reserve_authority.key(),
    has_one = base_mint,
  )]
  pub token_bonding: Account<'info, TokenBondingV0>,
  pub reserve_authority: Signer<'info>,
  pub base_mint: Box<Account<'info, Mint>>,
  #[account(mut,
    associated_token::mint = base_mint,
    associated_token::authority = token_bonding,
    associated_token::token_program = base_token_program)]
  pub base_storage: Box<InterfaceAccount<'info, TokenAccount>>,
  pub token_program: Program<'info, Token>,
}
